/**
 * The autopilot cron (GET /api/cron/autopilot). Idempotent and safe to call
 * at any frequency; every step records what it did so repeats are no-ops.
 *
 *  1. Weekly digest (flow D): Mondays from 06:00 local, once per 6 days.
 *  2. Cadence fill (flow E): Pro/Team users with a fixed cadence get a job
 *     when a slot in the next 48 hours has nothing queued.
 *  3. Review reminders (flow F): pending items whose slot passed move to the
 *     next free slot and the user gets one reminder.
 *  4. Trial emails (flow J) and the trial-end downgrade.
 *  5. LinkedIn expiry (flow K): reminder 7 days before, status flip after.
 *  6. Lapsed subscriptions: settings brought within Free.
 *
 * Every autopilot path also re-checks the plan's repo limit at run time.
 */
import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { getUserPlan, planHasFeature } from '@/lib/plans'
import { enforcePlanLimits } from '@/lib/billing/sync'
import {
  listEnabledAutopilotUsers,
  listOverdueReviewItems,
  listTakenSlots,
  listTrialsEndingBetween,
  touchAutopilotRun,
  updateQueueItem,
  getAutopilotSettings,
  draftContent,
  draftHashtags,
  type AutopilotUser,
} from '@/lib/db/queries/autopilot'
import { listAutopilotRepos } from '@/lib/db/queries/repos'
import { hasActiveJobForUser, listReposWithJobsSince } from '@/lib/db/queries/jobs'
import { getGithubAccessToken, expireStaleLinkedInConnections, listExpiringLinkedInConnections } from '@/lib/db/queries/integrations'
import { getDraftWithContext } from '@/lib/db/queries/drafts'
import { hasEmailedUserSince } from '@/lib/db/queries/notifications'
import { getPublishStats } from '@/lib/db/queries/publish'
import { getRepoActivity } from '@/lib/github/activity'
import { startGenerationJob } from '@/lib/pipeline/start'
import { normalizeTimezone, slotKey, upcomingSlots } from './slots'
import { findNextSlot } from './queue'
import { allowedAutopilotRepoIds } from './limits'
import { listSubscriptionUsersEndedBetween } from '@/lib/db/queries/billing'
import { sendApprovalRequests, sendLinkedInExpiring, sendTrialNotice } from './emails'
import type { PostPlatform } from '@/types/posts'

const DAY = 24 * 3600_000
const HOUR = 3600_000

export interface AutopilotCronResult {
  ok: true
  digests: number
  cadenceJobs: number
  reminders: number
  trialEmails: number
  linkedinExpiryEmails: number
  /** Users brought within Free after their subscription ran out. */
  lapsed: number
  durationMs: number
}

export interface PlannerOptions {
  now?: Date
  /** Stop starting new work after this many ms (serverless time limits). */
  budgetMs?: number
}

/* ─── 1. Weekly digest ─────────────────────────────────────────────────── */

/**
 * The most recent Monday 06:00 in `timezone` at or before `now`. Using an
 * instant (rather than "is it Monday morning right now?") makes the digest
 * independent of when the cron happens to run: a run on Tuesday still
 * catches a Monday that no run covered.
 */
export function lastDigestInstant(now: Date, timezone: string): Date {
  const tz = normalizeTimezone(timezone)
  const local = new TZDate(now.getTime(), tz)
  const daysSinceMonday = (local.getDay() + 6) % 7
  let instant = new TZDate(local.getFullYear(), local.getMonth(), local.getDate() - daysSinceMonday, 6, 0, tz)
  if (instant.getTime() > now.getTime()) {
    instant = new TZDate(local.getFullYear(), local.getMonth(), local.getDate() - daysSinceMonday - 7, 6, 0, tz)
  }
  return new Date(instant.getTime())
}

export function isDigestDue(user: Pick<AutopilotUser, 'settings' | 'lastDigestAt'>, now: Date): boolean {
  if (!user.settings.triggers.includes('weekly_digest')) return false
  const due = lastDigestInstant(now, user.settings.timezone)
  return !user.lastDigestAt || user.lastDigestAt.getTime() < due.getTime()
}

async function runDigest(user: AutopilotUser, now: Date): Promise<number> {
  const plan = await getUserPlan(user.userId)
  if (!planHasFeature(plan.id, 'autopilot.weekly_digest')) return 0

  // Mark first so a slow or failing GitHub never causes repeat digests.
  await touchAutopilotRun(user.userId, { lastDigestAt: now })

  const token = await getGithubAccessToken(user.userId)
  if (!token) return 0
  const since = new Date(now.getTime() - 7 * DAY)
  // Only the repos the current plan covers (a lapsed subscription sends no webhook).
  const allowed = await allowedAutopilotRepoIds(user.userId, plan)
  const repos = (await listAutopilotRepos(user.userId)).filter((r) => allowed.has(r.id)).slice(0, 10)

  const active: { repoId: string; meaningful: number }[] = []
  for (const repo of repos) {
    const activity = await getRepoActivity({ accessToken: token, fullName: repo.fullName, since, until: now })
    if (activity.meaningful >= 3) active.push({ repoId: repo.id, meaningful: activity.meaningful })
  }
  active.sort((a, b) => b.meaningful - a.meaningful)

  let started = 0
  for (const { repoId } of active.slice(0, 3)) {
    const result = await startGenerationJob({
      userId: user.userId,
      repoId,
      source: { type: 'window', windowStart: since, windowEnd: now },
      trigger: 'weekly_digest',
      autoQueue: true,
    })
    if (result.ok) started++
    else if (result.code === 'limit_reached') break
  }
  return started
}

/* ─── 2. Cadence fill ──────────────────────────────────────────────────── */

/** Slots in the next 48 hours where at least one platform has nothing queued. */
export async function findEmptySlots(user: AutopilotUser, now: Date): Promise<Date[]> {
  const slots = upcomingSlots(user.settings, now, { until: new Date(now.getTime() + 48 * HOUR), count: 20 })
  if (slots.length === 0) return []
  const platforms: PostPlatform[] = user.settings.platforms.length ? user.settings.platforms : ['linkedin', 'twitter']
  const taken = await Promise.all(platforms.map((p) => listTakenSlots(user.userId, p, now)))
  const takenKeys = taken.map((list) => new Set(list.map(slotKey)))
  return slots.filter((slot) => takenKeys.some((keys) => !keys.has(slotKey(slot))))
}

async function runCadence(user: AutopilotUser, now: Date): Promise<number> {
  if (user.settings.cadence === 'ship_moments') return 0
  if (user.lastPlannedAt && now.getTime() - user.lastPlannedAt.getTime() < 6 * HOUR) return 0
  const plan = await getUserPlan(user.userId)
  if (!planHasFeature(plan.id, 'autopilot.cadence')) return 0

  const empty = await findEmptySlots(user, now)
  if (empty.length === 0) return 0
  if (await hasActiveJobForUser(user.userId)) return 0

  await touchAutopilotRun(user.userId, { lastPlannedAt: now })

  const token = await getGithubAccessToken(user.userId)
  if (!token) return 0

  const floor = now.getTime() - 7 * DAY
  const windowStart = new Date(
    Math.max(floor, user.lastPlannedAt?.getTime() ?? 0, user.lastDigestAt?.getTime() ?? 0),
  )
  const recentlyUsed = await listReposWithJobsSince(user.userId, new Date(now.getTime() - 72 * HOUR))
  const allowed = await allowedAutopilotRepoIds(user.userId, plan)
  const candidates = (await listAutopilotRepos(user.userId))
    .filter((r) => allowed.has(r.id) && !recentlyUsed.has(r.id))
    .slice(0, 6)

  let best: { repoId: string; latestAt: number } | null = null
  for (const repo of candidates) {
    const activity = await getRepoActivity({ accessToken: token, fullName: repo.fullName, since: windowStart, until: now })
    if (activity.meaningful === 0 || !activity.latestAt) continue
    if (!best || activity.latestAt.getTime() > best.latestAt) best = { repoId: repo.id, latestAt: activity.latestAt.getTime() }
  }
  // No meaningful commits: the slot stays empty. CommitFlex never invents content.
  if (!best) return 0

  const result = await startGenerationJob({
    userId: user.userId,
    repoId: best.repoId,
    source: { type: 'window', windowStart, windowEnd: now },
    trigger: 'cadence',
    autoQueue: true,
  })
  return result.ok ? 1 : 0
}

/* ─── 3. Review reminders ──────────────────────────────────────────────── */

async function runReminders(now: Date, deadline: number): Promise<number> {
  const overdue = await listOverdueReviewItems(now)
  let reminders = 0
  for (const item of overdue) {
    if (Date.now() > deadline) break
    try {
      const settings = await getAutopilotSettings(item.userId)
      const platform: PostPlatform = item.platform === 'twitter' ? 'twitter' : 'linkedin'
      const next = await findNextSlot(item.userId, platform, { now, excludeId: item.id, settings })
      const shouldRemind = !item.reminderSentAt
      await updateQueueItem(item.id, { scheduledFor: next, ...(shouldRemind ? { reminderSentAt: now } : {}) })
      if (!shouldRemind) continue

      const ctx = await getDraftWithContext(item.draftId)
      if (!ctx) continue
      const sent = await sendApprovalRequests({
        userId: item.userId,
        jobId: ctx.job.id,
        repoFullName: ctx.repoFullName ?? 'your repo',
        sourceTitle: null,
        timezone: settings.timezone,
        reminder: true,
        posts: [
          {
            queueItemId: item.id,
            draftId: item.draftId,
            platform,
            content: draftContent(ctx.draft),
            hashtags: draftHashtags(ctx.draft.platformMetadata as Record<string, unknown>),
            scheduledFor: next,
          },
        ],
      })
      if (sent > 0) reminders++
    } catch (err) {
      console.error('[autopilot] reminder failed', item.id, err)
    }
  }
  return reminders
}

/* ─── 4. Trials ────────────────────────────────────────────────────────── */

function humanDate(date: Date, timezone: string): string {
  return format(new TZDate(date.getTime(), normalizeTimezone(timezone)), 'd MMM yyyy')
}

async function runTrials(now: Date, deadline: number): Promise<number> {
  let sent = 0

  // Day 11: "Your trial ends in 3 days" (window 2-3 days ahead so daily runs catch it once).
  const ending = await listTrialsEndingBetween(new Date(now.getTime() + 2 * DAY), new Date(now.getTime() + 3 * DAY))
  for (const t of ending) {
    if (Date.now() > deadline) break
    try {
      if (await hasEmailedUserSince(t.userId, 'trial_ending', new Date(now.getTime() - 20 * DAY))) continue
      const plan = await getUserPlan(t.userId)
      if (plan.status !== 'trialing') continue
      const settings = await getAutopilotSettings(t.userId)
      const stats = await getPublishStats(t.userId, { from: new Date(t.trialEndsAt.getTime() - 14 * DAY), to: now })
      const ok = await sendTrialNotice({
        userId: t.userId,
        kind: 'trial_ending',
        periodEnd: humanDate(t.trialEndsAt, settings.timezone),
        stats: { drafted: stats.totals.drafted, published: stats.totals.published },
      })
      if (ok) sent++
    } catch (err) {
      console.error('[autopilot] trial ending email failed', t.userId, err)
    }
  }

  // Trial over (within the last 7 days): apply Free limits once and say so.
  const ended = await listTrialsEndingBetween(new Date(now.getTime() - 7 * DAY), now)
  for (const t of ended) {
    if (Date.now() > deadline) break
    try {
      if (await hasEmailedUserSince(t.userId, 'trial_ended', new Date(now.getTime() - 20 * DAY))) continue
      const plan = await getUserPlan(t.userId)
      if (plan.id !== 'free') continue
      await enforcePlanLimits(t.userId)
      const ok = await sendTrialNotice({ userId: t.userId, kind: 'trial_ended', periodEnd: null })
      if (ok) sent++
    } catch (err) {
      console.error('[autopilot] trial ended handling failed', t.userId, err)
    }
  }
  return sent
}

/* ─── 5. LinkedIn expiry ───────────────────────────────────────────────── */

async function runLinkedInExpiry(now: Date): Promise<number> {
  await expireStaleLinkedInConnections(now)
  const expiring = await listExpiringLinkedInConnections(now, new Date(now.getTime() + 7 * DAY))
  let sent = 0
  for (const row of expiring) {
    const expiresAt = row.connection.expiresAt
    if (!expiresAt) continue
    try {
      const settings = await getAutopilotSettings(row.connection.userId)
      const ok = await sendLinkedInExpiring(
        row.connection.userId,
        format(new TZDate(expiresAt.getTime(), settings.timezone), 'EEE, d MMM'),
        now,
      )
      if (ok) sent++
    } catch (err) {
      console.error('[autopilot] linkedin expiry email failed', err)
    }
  }
  return sent
}

/* ─── 6. Lapsed subscriptions ──────────────────────────────────────────── */

/**
 * A subscription that simply runs out (cancelled, period over) sends no
 * webhook, so nothing ever called enforcePlanLimits for it. Catch those here:
 * anyone whose paid period ended in the last 7 days and who now resolves to
 * Free gets their settings brought within Free.
 */
async function runLapsedSubscriptions(now: Date, deadline: number): Promise<number> {
  const userIds = await listSubscriptionUsersEndedBetween(new Date(now.getTime() - 7 * DAY), now)
  let enforced = 0
  for (const userId of userIds) {
    if (Date.now() > deadline) break
    try {
      const plan = await getUserPlan(userId)
      if (plan.id !== 'free') continue
      await enforcePlanLimits(userId)
      enforced++
    } catch (err) {
      console.error('[autopilot] lapsed subscription enforcement failed', userId, err)
    }
  }
  return enforced
}

/* ─── Entry point ──────────────────────────────────────────────────────── */

export async function runAutopilotCron(opts: PlannerOptions = {}): Promise<AutopilotCronResult> {
  const started = Date.now()
  const now = opts.now ?? new Date()
  const deadline = started + (opts.budgetMs ?? 50_000)

  let digests = 0
  let cadenceJobs = 0

  const users = await listEnabledAutopilotUsers(now)
  for (const user of users) {
    if (Date.now() > deadline) break
    try {
      if (isDigestDue(user, now)) digests += await runDigest(user, now)
    } catch (err) {
      console.error('[autopilot] digest failed', user.userId, err)
    }
    try {
      if (Date.now() <= deadline) cadenceJobs += await runCadence(user, now)
    } catch (err) {
      console.error('[autopilot] cadence failed', user.userId, err)
    }
  }

  const reminders = await runReminders(now, deadline).catch((err) => {
    console.error('[autopilot] reminders failed', err)
    return 0
  })
  const trialEmails = await runTrials(now, deadline).catch((err) => {
    console.error('[autopilot] trials failed', err)
    return 0
  })
  const linkedinExpiryEmails = await runLinkedInExpiry(now).catch((err) => {
    console.error('[autopilot] linkedin expiry failed', err)
    return 0
  })
  const lapsed = await runLapsedSubscriptions(now, deadline).catch((err) => {
    console.error('[autopilot] lapsed subscriptions failed', err)
    return 0
  })

  return {
    ok: true,
    digests,
    cadenceJobs,
    reminders,
    trialEmails,
    linkedinExpiryEmails,
    lapsed,
    durationMs: Date.now() - started,
  }
}
