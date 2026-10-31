/**
 * Queue actions. Every action verifies ownership and throws
 * QueueError(status, code, message) for expected failures (and PlanError for
 * plan limits). Routes turn both into JSON with `queueErrorToResponse`.
 *
 * Status machine:
 *   pending_review → approved | scheduled | skipped
 *   approved       → scheduled | ready | published | skipped
 *   scheduled      → publishing → published | ready | scheduled (retry) | failed
 *   ready          → published (extension, x_intent, manual)
 */
import { assertFeature, assertWithinLimit, getUserPlan, planHasFeature, limitFor, isPlanError } from '@/lib/plans'
import { getDraftWithContext, getDraftsByJob, setDraftStatus } from '@/lib/db/queries/drafts'
import {
  getAutopilotSettings,
  getQueueItemView,
  getQueueRowByDraft,
  insertQueueItem,
  listTakenSlots,
  transitionQueueItem,
  updateQueueItem,
  draftHashtags,
  draftContent,
} from '@/lib/db/queries/autopilot'
import { getJob } from '@/lib/db/queries/jobs'
import { getRepo } from '@/lib/db/queries/repos'
import { insertPublishLog } from '@/lib/db/queries/publish'
import { emitEvent } from '@/lib/db/queries/events'
import type { QueueItemRow } from '@/lib/db/schema'
import { ACTIVE_QUEUE_STATUSES, type AutopilotSettings, type PublishResult, type QueueItemView, type QueueStatus } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { publishQueueItem } from '@/lib/publish/publisher'
import { getUserContact, getUserEmail } from '@/lib/db/queries/notifications'
import { QueueError, queueErrorToResponse } from './errors'
import { nextFreeSlot, sameSlot } from './slots'
import { sendApprovalRequests, sendScheduledSummary, type EmailPost } from './emails'

export { QueueError, queueErrorToResponse }

/** New items are never scheduled closer than this to "now". */
const MIN_LEAD_MS = 5 * 60_000

type DraftContext = NonNullable<Awaited<ReturnType<typeof getDraftWithContext>>>

async function loadOwnedDraft(userId: string, draftId: string): Promise<DraftContext> {
  const ctx = await getDraftWithContext(draftId)
  if (!ctx || ctx.draft.deletedAt) throw new QueueError(404, 'not_found', 'That draft was not found.')
  if (ctx.draft.userId !== userId) throw new QueueError(403, 'forbidden', 'That draft belongs to someone else.')
  return ctx
}

function platformOf(value: string): PostPlatform {
  return value === 'twitter' ? 'twitter' : 'linkedin'
}

async function toView(row: QueueItemRow): Promise<QueueItemView> {
  const view = await getQueueItemView(row.id)
  if (!view) throw new QueueError(404, 'not_found', 'That queue item was not found.')
  return view
}

function isActive(status: string): boolean {
  return (ACTIVE_QUEUE_STATUSES as readonly string[]).includes(status)
}

/** The next slot with no item for this platform. Falls back to one hour from now. */
export async function findNextSlot(
  userId: string,
  platform: PostPlatform,
  opts: { now?: Date; excludeId?: string; settings?: AutopilotSettings } = {},
): Promise<Date> {
  const now = opts.now ?? new Date()
  const settings = opts.settings ?? (await getAutopilotSettings(userId))
  const from = new Date(now.getTime() + MIN_LEAD_MS)
  const taken = await listTakenSlots(userId, platform, from, opts.excludeId)
  return nextFreeSlot(settings, from, taken) ?? new Date(now.getTime() + 3600_000)
}

async function assertQueueRoom(userId: string): Promise<void> {
  await assertWithinLimit(userId, 'queuedPosts')
}

/* ─── Approve ──────────────────────────────────────────────────────────── */

/**
 * Approves a queue row. Returns `changed: false` when it was already
 * approved (or further along), which callers report as "already".
 */
export async function approveQueueRow(
  row: QueueItemRow,
  approvedBy: string,
  now: Date = new Date(),
): Promise<{ item: QueueItemRow; changed: boolean }> {
  if (['approved', 'scheduled', 'ready', 'publishing', 'published'].includes(row.status)) {
    return { item: row, changed: false }
  }
  if (!isActive(row.status)) await assertQueueRoom(row.userId)

  const settings = await getAutopilotSettings(row.userId)
  const platform = platformOf(row.platform)
  let scheduledFor = row.scheduledFor
  // Keep the assigned slot when it's still ahead; otherwise take the next free one.
  if (scheduledFor && scheduledFor.getTime() < now.getTime() + 60_000) {
    scheduledFor = await findNextSlot(row.userId, platform, { now, excludeId: row.id, settings })
  }

  const item = await updateQueueItem(row.id, {
    status: scheduledFor ? 'scheduled' : 'approved',
    scheduledFor,
    approvedAt: now,
    approvedBy,
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
  })
  return { item, changed: true }
}

export async function approveDraft(userId: string, draftId: string, approvedBy = 'owner'): Promise<QueueItemView> {
  const ctx = await loadOwnedDraft(userId, draftId)
  const row = await getQueueRowByDraft(draftId)
  if (!row) {
    await assertQueueRoom(userId)
    const created = await insertQueueItem({
      userId,
      draftId,
      repoId: ctx.job.repoId,
      platform: platformOf(ctx.draft.platform),
      status: 'approved',
      approvedAt: new Date(),
      approvedBy,
    })
    return toView(created)
  }
  if (row.status === 'published' || row.status === 'publishing') {
    throw new QueueError(409, 'invalid_state', 'This post is already published.')
  }
  const { item } = await approveQueueRow(row, approvedBy)
  return toView(item)
}

/* ─── Schedule ─────────────────────────────────────────────────────────── */

export async function scheduleDraft(userId: string, draftId: string, at: Date | 'next_slot'): Promise<QueueItemView> {
  const ctx = await loadOwnedDraft(userId, draftId)
  const now = new Date()
  const platform = platformOf(ctx.draft.platform)
  const row = await getQueueRowByDraft(draftId)

  if (row && (row.status === 'published' || row.status === 'publishing')) {
    throw new QueueError(409, 'invalid_state', 'This post is already published.')
  }
  if (at !== 'next_slot') {
    if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
      throw new QueueError(400, 'in_past', 'Pick a time in the future.')
    }
  }
  if (!row || !isActive(row.status)) await assertQueueRoom(userId)

  let when: Date
  if (at === 'next_slot') {
    when = await findNextSlot(userId, platform, { now, excludeId: row?.id })
  } else {
    const taken = await listTakenSlots(userId, platform, new Date(at.getTime() - 60_000), row?.id)
    if (taken.some((t) => sameSlot(t, at))) {
      throw new QueueError(409, 'slot_taken', `Another ${platform === 'twitter' ? 'X' : 'LinkedIn'} post is already scheduled at that time.`)
    }
    when = at
  }

  const patch = {
    status: 'scheduled' as QueueStatus,
    scheduledFor: when,
    approvedAt: row?.approvedAt ?? now,
    approvedBy: row?.approvedBy ?? 'owner',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
  }
  const item = row
    ? await updateQueueItem(row.id, patch)
    : await insertQueueItem({ userId, draftId, repoId: ctx.job.repoId, platform, ...patch })
  return toView(item)
}

export async function unscheduleDraft(userId: string, draftId: string): Promise<QueueItemView> {
  await loadOwnedDraft(userId, draftId)
  const row = await getQueueRowByDraft(draftId)
  if (!row) throw new QueueError(404, 'not_found', 'This draft is not in your queue.')
  if (row.status === 'published' || row.status === 'publishing') {
    throw new QueueError(409, 'invalid_state', 'This post is already published.')
  }
  const item = await updateQueueItem(row.id, {
    status: row.approvedAt ? 'approved' : 'pending_review',
    scheduledFor: null,
    nextAttemptAt: null,
  })
  return toView(item)
}

export async function skipDraft(userId: string, draftId: string): Promise<QueueItemView> {
  const ctx = await loadOwnedDraft(userId, draftId)
  const row = await getQueueRowByDraft(draftId)
  if (row && (row.status === 'published' || row.status === 'publishing')) {
    throw new QueueError(409, 'invalid_state', 'This post is already published.')
  }
  const item = row
    ? await updateQueueItem(row.id, { status: 'skipped', nextAttemptAt: null })
    : await insertQueueItem({
        userId,
        draftId,
        repoId: ctx.job.repoId,
        platform: platformOf(ctx.draft.platform),
        status: 'skipped',
      })
  return toView(item)
}

/* ─── Publish ──────────────────────────────────────────────────────────── */

export async function publishDraftNow(
  userId: string,
  draftId: string,
  opts: { method?: 'linkedin_api' | 'handoff' } = {},
): Promise<{ item: QueueItemView; result: PublishResult }> {
  const ctx = await loadOwnedDraft(userId, draftId)
  const platform = platformOf(ctx.draft.platform)
  if (opts.method === 'linkedin_api') {
    if (platform !== 'linkedin') throw new QueueError(400, 'invalid_request', 'Only LinkedIn posts publish through the API.')
    await assertFeature(userId, 'publish.linkedin_direct')
  }

  let row = await getQueueRowByDraft(draftId)
  if (row && row.status === 'published') throw new QueueError(409, 'invalid_state', 'This post is already published.')
  if (row && row.status === 'publishing') throw new QueueError(409, 'invalid_state', 'This post is being published right now.')
  if (!row) {
    row = await insertQueueItem({
      userId,
      draftId,
      repoId: ctx.job.repoId,
      platform,
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: 'owner',
    })
  }

  // Claim the row before publishing. A double click, a second tab or the
  // publish cron picking the same scheduled row all lose here instead of
  // posting twice.
  const claimed = await transitionQueueItem(
    row.id,
    ['pending_review', 'approved', 'scheduled', 'ready', 'failed', 'skipped'],
    { status: 'publishing' },
  )
  if (!claimed) throw new QueueError(409, 'invalid_state', 'This post is being published right now.')

  let outcome: Awaited<ReturnType<typeof publishQueueItem>>
  try {
    outcome = await publishQueueItem(claimed, {
      interactive: true,
      notify: false,
      forceHandoff: opts.method === 'handoff',
      claimed: true,
    })
  } catch (err) {
    // Interactive errors already moved the row on (ready); anything else
    // must not leave it stuck in 'publishing'.
    await transitionQueueItem(claimed.id, ['publishing'], { status: row.status as QueueStatus }).catch(() => null)
    throw err
  }
  return { item: await toView(outcome.item), result: outcome.result }
}

export async function recordManualPublish(input: {
  userId: string
  draftId: string
  method: 'extension' | 'x_intent' | 'manual'
  externalUrl?: string | null
}): Promise<QueueItemView> {
  const ctx = await loadOwnedDraft(input.userId, input.draftId)
  const now = new Date()
  const platform = platformOf(ctx.draft.platform)
  const row = await getQueueRowByDraft(input.draftId)
  // The publish cron may be mid-API-call; marking it now would race with it.
  if (row?.status === 'publishing') {
    throw new QueueError(409, 'invalid_state', 'This post is being published right now.')
  }
  const patch = {
    status: 'published' as QueueStatus,
    publishedAt: now,
    publishMethod: input.method,
    externalUrl: input.externalUrl ?? row?.externalUrl ?? null,
    lastError: null,
    nextAttemptAt: null,
    approvedAt: row?.approvedAt ?? now,
    approvedBy: row?.approvedBy ?? 'owner',
  }
  let item: QueueItemRow
  if (row) {
    if (row.status === 'published') return toView(row)
    const moved = await transitionQueueItem(
      row.id,
      ['pending_review', 'approved', 'scheduled', 'ready', 'failed', 'skipped'],
      patch,
    )
    if (!moved) throw new QueueError(409, 'invalid_state', 'This post is being published right now.')
    item = moved
  } else {
    item = await insertQueueItem({ userId: input.userId, draftId: input.draftId, repoId: ctx.job.repoId, platform, ...patch })
  }
  await insertPublishLog({
    userId: input.userId,
    queueItemId: item.id,
    draftId: input.draftId,
    platform,
    method: input.method,
    success: true,
  })
  await setDraftStatus(input.draftId, 'published')
  return toView(item)
}

/**
 * Reverses a publish the extension recorded on its own (Undo on the
 * "Marked as posted" toast). Only 'extension' publishes can be undone.
 */
export async function undoExtensionPublish(userId: string, draftId: string): Promise<QueueItemView> {
  await loadOwnedDraft(userId, draftId)
  const row = await getQueueRowByDraft(draftId)
  if (!row || row.status !== 'published' || row.publishMethod !== 'extension') {
    throw new QueueError(409, 'invalid_state', 'Only a post the extension marked as posted can be undone.')
  }
  const item = await transitionQueueItem(row.id, ['published'], {
    status: 'ready',
    publishedAt: null,
    publishMethod: null,
    externalUrl: null,
  })
  if (!item) throw new QueueError(409, 'invalid_state', 'This post changed in the meantime. Refresh and try again.')
  await setDraftStatus(draftId, 'copied')
  return toView(item)
}

/* ─── Auto-queue after a job ───────────────────────────────────────────── */

export interface EnqueueResult {
  queued: number
  skippedForLimit: number
  mode: 'review' | 'auto' | null
}

/**
 * Queues a finished job's drafts into the next free slots (first draft per
 * platform, only the platforms autopilot posts to), then emails the user:
 * Approve links in review mode, a "Scheduled" summary in auto mode.
 */
export async function enqueueJobDrafts(jobId: string, now: Date = new Date()): Promise<EnqueueResult> {
  const job = await getJob(jobId)
  if (!job) return { queued: 0, skippedForLimit: 0, mode: null }

  const [settings, plan, drafts, repo] = await Promise.all([
    getAutopilotSettings(job.userId),
    getUserPlan(job.userId),
    getDraftsByJob(jobId),
    getRepo(job.repoId),
  ])

  const autoMode = settings.approvalMode === 'auto' && planHasFeature(plan.id, 'publish.auto_approve')
  const platforms = settings.platforms.length ? settings.platforms : (['linkedin', 'twitter'] as PostPlatform[])

  // One post per platform: the first draft by sequence number.
  const firsts = new Map<PostPlatform, (typeof drafts)[number]>()
  for (const d of [...drafts].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    const p = platformOf(d.platform)
    if (!platforms.includes(p) || firsts.has(p)) continue
    firsts.set(p, d)
  }

  const posts: EmailPost[] = []
  let skippedForLimit = 0
  for (const [platform, draft] of Array.from(firsts.entries())) {
    if (await getQueueRowByDraft(draft.id)) continue
    try {
      await assertQueueRoom(job.userId)
    } catch (err) {
      if (isPlanError(err)) {
        skippedForLimit++
        continue
      }
      throw err
    }
    const scheduledFor = await findNextSlot(job.userId, platform, { now, settings })
    const row = await insertQueueItem({
      userId: job.userId,
      draftId: draft.id,
      repoId: job.repoId,
      platform,
      status: autoMode ? 'scheduled' : 'pending_review',
      scheduledFor,
      approvedAt: autoMode ? now : null,
      approvedBy: autoMode ? 'auto' : null,
    })
    posts.push({
      queueItemId: row.id,
      draftId: draft.id,
      platform,
      content: draftContent(draft),
      hashtags: draftHashtags(draft.platformMetadata as Record<string, unknown>),
      scheduledFor,
    })
  }

  try {
    await emitEvent(jobId, 'queued_drafts', { queued: posts.length, skippedForLimit, mode: autoMode ? 'auto' : 'review' })
  } catch {
    // Event logging is best effort.
  }

  if (posts.length > 0) {
    const sourceTitle = sourceTitleForJob(job)
    const emailCtx = {
      userId: job.userId,
      jobId,
      repoFullName: repo?.fullName ?? 'your repo',
      sourceTitle,
      timezone: settings.timezone,
      posts,
    }
    if (autoMode) {
      await sendScheduledSummary(emailCtx)
    } else {
      const reviewers = planHasFeature(plan.id, 'team.reviewers')
        ? settings.reviewerEmails.slice(0, limitFor(plan.id, 'reviewers'))
        : []
      await sendApprovalRequests({ ...emailCtx, reviewerEmails: reviewers })
    }
  }

  return { queued: posts.length, skippedForLimit, mode: autoMode ? 'auto' : 'review' }
}

function sourceTitleForJob(job: { trigger: string; sourceType: string; sourceRef: string | null }): string | null {
  if (job.trigger === 'weekly_digest') return 'your week of commits'
  if (job.sourceType === 'release' && job.sourceRef) return `release ${job.sourceRef}`
  if (job.sourceType === 'pr' && job.sourceRef) {
    const m = /\/pull\/(\d+)/.exec(job.sourceRef)
    return m ? `pull request #${m[1]}` : 'your pull request'
  }
  return null
}

/* ─── Re-review after an edit ──────────────────────────────────────────── */

/**
 * The owner edited a draft that a Team reviewer had already approved. The
 * approved text is no longer the text that would go out, so the item goes
 * back to review and the reviewers get fresh Approve links. Approvals by the
 * owner (in the app, 'owner', or by email link) and by auto mode stand.
 * Returns true when the item was sent back.
 */
export async function requireReReviewAfterEdit(userId: string, draftId: string): Promise<boolean> {
  const row = await getQueueRowByDraft(draftId)
  if (!row || row.userId !== userId) return false
  if (row.status !== 'approved' && row.status !== 'scheduled') return false
  const by = (row.approvedBy ?? '').toLowerCase()
  if (!by || by === 'owner' || by === 'auto') return false
  const contact = await getUserContact(userId)
  const ownerEmails = new Set([contact?.email?.toLowerCase(), (await getUserEmail(userId))?.toLowerCase()].filter(Boolean))
  if (ownerEmails.has(by)) return false

  const moved = await transitionQueueItem(row.id, ['approved', 'scheduled'], {
    status: 'pending_review',
    approvedAt: null,
    approvedBy: null,
  })
  if (!moved) return false

  try {
    const [job, settings, plan, ctx] = await Promise.all([
      getJob((await getDraftWithContext(draftId))?.draft.jobId ?? ''),
      getAutopilotSettings(userId),
      getUserPlan(userId),
      getDraftWithContext(draftId),
    ])
    if (job && ctx && planHasFeature(plan.id, 'team.reviewers')) {
      const repo = await getRepo(job.repoId)
      await sendApprovalRequests({
        userId,
        jobId: job.id,
        repoFullName: repo?.fullName ?? 'your repo',
        sourceTitle: sourceTitleForJob(job),
        timezone: settings.timezone,
        posts: [
          {
            queueItemId: moved.id,
            draftId,
            platform: platformOf(moved.platform),
            content: draftContent(ctx.draft),
            hashtags: draftHashtags(ctx.draft.platformMetadata as Record<string, unknown>),
            scheduledFor: moved.scheduledFor,
          },
        ],
        reviewerEmails: settings.reviewerEmails.slice(0, limitFor(plan.id, 'reviewers')),
      })
    }
  } catch (err) {
    console.error('[queue] re-review request failed', err)
  }
  return true
}
