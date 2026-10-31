/**
 * Every autopilot email in one place. Each sender checks the user's
 * notification preferences, logs to email_log and never throws: a mail
 * problem must never break publishing or the pipeline.
 */
import { appUrl, optionalEnv } from '@/lib/env'
import { sendEmail } from '@/lib/mailer'
import {
  getPrefs,
  getUserContact,
  hasEmailedUserSince,
  logEmail,
  type NotificationPreferences,
} from '@/lib/db/queries/notifications'
import { ApprovalRequestEmail, type ApprovalEmailItem } from '@/lib/email/templates/approval-request'
import { ScheduledSummaryEmail } from '@/lib/email/templates/scheduled-summary'
import { ReadyToPostEmail, type ReadyEmailItem } from '@/lib/email/templates/ready-to-post'
import { PublishStatusEmail } from '@/lib/email/templates/publish-status'
import { LimitReachedEmail } from '@/lib/email/templates/limit-reached'
import { BillingNoticeEmail, billingNoticeSubject } from '@/lib/email/templates/billing-notice'
import { approvalUrl, createApprovalTokens, type ApprovalAction } from './approval'
import { formatSlotLong } from './slots'
import { buildIntentUrl, composePostText } from '@/lib/publish/intents'
import type { ReactElement } from 'react'

export interface EmailPost {
  queueItemId: string
  draftId: string
  platform: 'linkedin' | 'twitter'
  content: string
  hashtags: string[]
  scheduledFor: Date | null
}

type PrefKey = keyof Pick<NotificationPreferences, 'approvalRequests' | 'readyToPost' | 'publishReceipts' | 'emailOnComplete'>

function extensionUrl(): string {
  return optionalEnv('NEXT_PUBLIC_CHROME_EXTENSION_URL') ?? `${appUrl()}/extension`
}

async function deliver(input: {
  userId: string
  to: string
  subject: string
  react: ReactElement
  kind: string
  jobId?: string | null
}): Promise<boolean> {
  try {
    const result = await sendEmail({ to: input.to, subject: input.subject, react: input.react })
    await logEmail({
      userId: input.userId,
      jobId: input.jobId ?? null,
      kind: input.kind,
      deliveryStatus: result.ok ? (result.consoleOnly ? 'console-only' : 'sent') : 'failed',
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
    })
    return result.ok
  } catch (err) {
    console.error(`[autopilot email] ${input.kind} failed`, err)
    return false
  }
}

async function prefAllows(userId: string, key: PrefKey | null): Promise<boolean> {
  if (!key) return true
  try {
    const prefs = await getPrefs(userId)
    return prefs[key] !== false
  } catch {
    return true
  }
}

/* ─── Approval requests (review mode) ─────────────────────────────────── */

export async function sendApprovalRequests(input: {
  userId: string
  jobId: string
  repoFullName: string
  sourceTitle: string | null
  timezone: string
  posts: EmailPost[]
  /** Team reviewers who also get Approve links. */
  reviewerEmails?: string[]
  reminder?: boolean
}): Promise<number> {
  if (input.posts.length === 0) return 0
  try {
    if (!(await prefAllows(input.userId, 'approvalRequests'))) return 0
    const contact = await getUserContact(input.userId)
    if (!contact) return 0

    const recipients = Array.from(
      new Set([contact.email.toLowerCase(), ...(input.reviewerEmails ?? []).map((e) => e.toLowerCase())]),
    )
    const ownerEmail = contact.email.toLowerCase()
    // Owners may approve or skip; Team reviewers may only approve.
    const tokens = await createApprovalTokens(
      input.userId,
      recipients.flatMap((email) =>
        input.posts.map((p) => ({
          queueItemId: p.queueItemId,
          email,
          actions: (email === ownerEmail ? ['approve', 'skip'] : ['approve']) as ApprovalAction[],
        })),
      ),
    )

    let sent = 0
    for (const email of recipients) {
      const isOwner = email === contact.email.toLowerCase()
      const items: ApprovalEmailItem[] = input.posts.map((p) => {
        const token = tokens.get(`${p.queueItemId}:${email}`) ?? ''
        return {
          platform: p.platform,
          content: composePostText(p.content, p.hashtags, p.platform),
          when: p.scheduledFor ? `Goes out ${formatSlotLong(p.scheduledFor, input.timezone)}` : null,
          approveUrl: approvalUrl(token, 'approve'),
          skipUrl: isOwner ? approvalUrl(token, 'skip') : null,
        }
      })
      const subject = input.reminder
        ? 'A draft is still waiting for your approval'
        : input.sourceTitle
          ? `Approve your posts about ${input.sourceTitle}`
          : `Approve ${items.length === 1 ? 'your new post' : `${items.length} new posts`} from ${input.repoFullName}`
      const ok = await deliver({
        userId: input.userId,
        to: email,
        subject,
        jobId: input.jobId,
        kind: input.reminder ? 'approval_reminder' : isOwner ? 'approval_request' : 'approval_request_reviewer',
        react: ApprovalRequestEmail({
          firstName: contact.firstName,
          repoName: input.repoFullName,
          sourceTitle: input.sourceTitle,
          items,
          reviewUrl: `${appUrl()}/queue?status=pending_review`,
          appUrl: appUrl(),
          reviewerFor: isOwner ? null : contact.name ?? contact.email,
          reminder: input.reminder,
        }),
      })
      if (ok) sent++
    }
    return sent
  } catch (err) {
    console.error('[autopilot email] approval request failed', err)
    return 0
  }
}

/* ─── Scheduled summary (auto mode) ───────────────────────────────────── */

export async function sendScheduledSummary(input: {
  userId: string
  jobId: string
  repoFullName: string
  sourceTitle: string | null
  timezone: string
  posts: EmailPost[]
}): Promise<boolean> {
  if (input.posts.length === 0) return false
  try {
    if (!(await prefAllows(input.userId, 'approvalRequests'))) return false
    const contact = await getUserContact(input.userId)
    if (!contact) return false
    const tokens = await createApprovalTokens(
      input.userId,
      input.posts.map((p) => ({ queueItemId: p.queueItemId, email: contact.email, actions: ['skip'] as ApprovalAction[] })),
    )
    return deliver({
      userId: input.userId,
      to: contact.email,
      jobId: input.jobId,
      kind: 'scheduled_summary',
      subject: `Scheduled: ${input.posts.length === 1 ? 'one post' : `${input.posts.length} posts`} about ${input.sourceTitle ?? input.repoFullName}`,
      react: ScheduledSummaryEmail({
        firstName: contact.firstName,
        repoName: input.repoFullName,
        sourceTitle: input.sourceTitle,
        appUrl: appUrl(),
        queueUrl: `${appUrl()}/queue`,
        items: input.posts.map((p) => ({
          platform: p.platform,
          content: composePostText(p.content, p.hashtags, p.platform),
          when: p.scheduledFor ? formatSlotLong(p.scheduledFor, input.timezone) : 'Next free slot',
          skipUrl: approvalUrl(tokens.get(`${p.queueItemId}:${contact.email.toLowerCase()}`) ?? '', 'skip'),
        })),
      }),
    })
  } catch (err) {
    console.error('[autopilot email] scheduled summary failed', err)
    return false
  }
}

/* ─── Ready to post (hand-off) ────────────────────────────────────────── */

export async function sendReadyToPost(input: {
  userId: string
  posts: (EmailPost & { reason?: string | null })[]
}): Promise<boolean> {
  if (input.posts.length === 0) return false
  try {
    if (!(await prefAllows(input.userId, 'readyToPost'))) return false
    const contact = await getUserContact(input.userId)
    if (!contact) return false
    const tokens = await createApprovalTokens(
      input.userId,
      input.posts.map((p) => ({ queueItemId: p.queueItemId, email: contact.email, actions: ['posted'] as ApprovalAction[] })),
    )
    const items: ReadyEmailItem[] = input.posts.map((p) => {
      const text = composePostText(p.content, p.hashtags, p.platform)
      return {
        platform: p.platform,
        content: text,
        intentUrl: buildIntentUrl(p.platform, text),
        postedUrl: approvalUrl(tokens.get(`${p.queueItemId}:${contact.email.toLowerCase()}`) ?? '', 'posted'),
        reason: p.reason ?? null,
      }
    })
    const platforms = Array.from(new Set(items.map((i) => (i.platform === 'twitter' ? 'X' : 'LinkedIn'))))
    return deliver({
      userId: input.userId,
      to: contact.email,
      kind: 'ready_to_post',
      subject: items.length === 1 ? `Ready to post on ${platforms[0]}` : `${items.length} posts ready for ${platforms.join(' and ')}`,
      react: ReadyToPostEmail({
        firstName: contact.firstName,
        items,
        queueUrl: `${appUrl()}/queue?status=ready`,
        extensionUrl: extensionUrl(),
        appUrl: appUrl(),
      }),
    })
  } catch (err) {
    console.error('[autopilot email] ready to post failed', err)
    return false
  }
}

/* ─── Publishing receipts and problems ────────────────────────────────── */

export async function sendPublishReceipt(input: { userId: string; content: string; postUrl: string | null }): Promise<boolean> {
  try {
    if (!(await prefAllows(input.userId, 'publishReceipts'))) return false
    const contact = await getUserContact(input.userId)
    if (!contact) return false
    return deliver({
      userId: input.userId,
      to: contact.email,
      kind: 'publish_receipt',
      subject: 'Published to LinkedIn',
      react: PublishStatusEmail({
        kind: 'published',
        firstName: contact.firstName,
        appUrl: appUrl(),
        platform: 'linkedin',
        content: input.content,
        postUrl: input.postUrl,
      }),
    })
  } catch (err) {
    console.error('[autopilot email] receipt failed', err)
    return false
  }
}

export async function sendPublishFailed(input: { userId: string; content: string; error: string | null }): Promise<boolean> {
  try {
    const contact = await getUserContact(input.userId)
    if (!contact) return false
    return deliver({
      userId: input.userId,
      to: contact.email,
      kind: 'publish_failed',
      subject: 'A LinkedIn post could not be published',
      react: PublishStatusEmail({
        kind: 'failed',
        firstName: contact.firstName,
        appUrl: appUrl(),
        platform: 'linkedin',
        content: input.content,
        error: input.error,
      }),
    })
  } catch (err) {
    console.error('[autopilot email] failure notice failed', err)
    return false
  }
}

/** At most one "Reconnect LinkedIn" email per user per 3 days. */
export async function sendLinkedInExpired(userId: string, now: Date = new Date()): Promise<boolean> {
  try {
    if (await hasEmailedUserSince(userId, 'linkedin_expired', new Date(now.getTime() - 3 * 24 * 3600_000))) return false
    const contact = await getUserContact(userId)
    if (!contact) return false
    return deliver({
      userId,
      to: contact.email,
      kind: 'linkedin_expired',
      subject: 'Reconnect LinkedIn',
      react: PublishStatusEmail({ kind: 'linkedin_expired', firstName: contact.firstName, appUrl: appUrl() }),
    })
  } catch (err) {
    console.error('[autopilot email] linkedin expired failed', err)
    return false
  }
}

export async function sendLinkedInExpiring(userId: string, expiresOn: string, now: Date = new Date()): Promise<boolean> {
  try {
    if (await hasEmailedUserSince(userId, 'linkedin_expiring', new Date(now.getTime() - 14 * 24 * 3600_000))) return false
    const contact = await getUserContact(userId)
    if (!contact) return false
    return deliver({
      userId,
      to: contact.email,
      kind: 'linkedin_expiring',
      subject: 'Your LinkedIn connection expires soon',
      react: PublishStatusEmail({ kind: 'linkedin_expiring', firstName: contact.firstName, appUrl: appUrl(), expiresOn }),
    })
  } catch (err) {
    console.error('[autopilot email] linkedin expiring failed', err)
    return false
  }
}

/* ─── Limits and trial ────────────────────────────────────────────────── */

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** "You've used this month's drafts", at most once per calendar month. */
export async function sendLimitReachedOnce(input: {
  userId: string
  used: number
  max: number
  planName: string
  nextPlanName: string
  nextPlanMax: number | null
  skipped: string | null
  now?: Date
}): Promise<boolean> {
  try {
    const now = input.now ?? new Date()
    if (await hasEmailedUserSince(input.userId, 'limit_reached', startOfUtcMonth(now))) return false
    const contact = await getUserContact(input.userId)
    if (!contact) return false
    return deliver({
      userId: input.userId,
      to: contact.email,
      kind: 'limit_reached',
      subject: "You've used this month's drafts",
      react: LimitReachedEmail({
        firstName: contact.firstName,
        used: input.used,
        max: input.max,
        planName: input.planName,
        nextPlanName: input.nextPlanName,
        nextPlanMax: input.nextPlanMax,
        skipped: input.skipped,
        appUrl: appUrl(),
      }),
    })
  } catch (err) {
    console.error('[autopilot email] limit reached failed', err)
    return false
  }
}

export async function sendTrialNotice(input: {
  userId: string
  kind: 'trial_ending' | 'trial_ended'
  periodEnd: string | null
  stats?: { drafted: number; published: number } | null
}): Promise<boolean> {
  try {
    const contact = await getUserContact(input.userId)
    if (!contact) return false
    return deliver({
      userId: input.userId,
      to: contact.email,
      kind: input.kind,
      subject: billingNoticeSubject(input.kind, 'Pro'),
      react: BillingNoticeEmail({
        firstName: contact.firstName,
        kind: input.kind,
        planName: 'Pro',
        manageUrl: `${appUrl()}/billing`,
        periodEnd: input.periodEnd,
        stats: input.stats ?? null,
      }),
    })
  } catch (err) {
    console.error('[autopilot email] trial notice failed', err)
    return false
  }
}
