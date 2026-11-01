/**
 * Autopilot data access: settings, the publishing queue, ship events and
 * approval tokens. Business rules live in `lib/autopilot/*`; this file only
 * reads and writes rows and shapes them into the serialisable views in
 * `types/autopilot.ts`.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  approvalTokens,
  autopilotSettings,
  generationJobs,
  postDrafts,
  queueItems,
  repos,
  shipEvents,
  userProfiles,
  users,
  type AutopilotSettingsRow,
  type QueueItemRow,
  type ShipEventRow,
} from '@/lib/db/schema'
import {
  ACTIVE_QUEUE_STATUSES,
  AUTOPILOT_CADENCES,
  AUTOPILOT_TRIGGERS,
  type AutopilotCadence,
  type AutopilotSettings,
  type AutopilotTrigger,
  type JobTrigger,
  type PublishMethod,
  type QueueItemView,
  type QueueStats,
  type QueueStatus,
  type ShipEventView,
} from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { normalizeTimezone } from '@/lib/autopilot/slots'

/* ─── Settings ─────────────────────────────────────────────────────────── */

export const DEFAULT_AUTOPILOT_SETTINGS: Omit<AutopilotSettings, 'timezone'> = {
  enabled: false,
  cadence: 'ship_moments',
  postDays: [2, 4],
  postTime: '09:00',
  triggers: ['pr_merged', 'release_published', 'weekly_digest'],
  platforms: ['linkedin', 'twitter'],
  approvalMode: 'review',
  reviewerEmails: [],
  defaultVoiceProfileId: null,
  pausedUntil: null,
}

const PLATFORMS: readonly PostPlatform[] = ['linkedin', 'twitter']

function asCadence(v: string): AutopilotCadence {
  return (AUTOPILOT_CADENCES as readonly string[]).includes(v) ? (v as AutopilotCadence) : 'ship_moments'
}

export function rowToSettings(row: AutopilotSettingsRow | null | undefined, timezone: string): AutopilotSettings {
  if (!row) return { ...DEFAULT_AUTOPILOT_SETTINGS, timezone: normalizeTimezone(timezone) }
  return {
    enabled: row.enabled,
    cadence: asCadence(row.cadence),
    postDays: row.postDays ?? [],
    postTime: row.postTime,
    triggers: (row.triggers ?? []).filter((t): t is AutopilotTrigger =>
      (AUTOPILOT_TRIGGERS as readonly string[]).includes(t),
    ),
    platforms: (row.platforms ?? []).filter((p): p is PostPlatform => (PLATFORMS as readonly string[]).includes(p)),
    approvalMode: row.approvalMode === 'auto' ? 'auto' : 'review',
    reviewerEmails: row.reviewerEmails ?? [],
    defaultVoiceProfileId: row.defaultVoiceProfileId ?? null,
    pausedUntil: row.pausedUntil ? row.pausedUntil.toISOString() : null,
    timezone: normalizeTimezone(timezone),
  }
}

export async function getUserTimezone(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: userProfiles.timezone })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
  return normalizeTimezone(row?.timezone)
}

export async function getAutopilotRow(userId: string): Promise<AutopilotSettingsRow | null> {
  const [row] = await db.select().from(autopilotSettings).where(eq(autopilotSettings.userId, userId)).limit(1)
  return row ?? null
}

/** Settings with defaults when the user has no row yet. */
export async function getAutopilotSettings(userId: string): Promise<AutopilotSettings> {
  const [row, timezone] = await Promise.all([getAutopilotRow(userId), getUserTimezone(userId)])
  return rowToSettings(row, timezone)
}

export async function upsertAutopilotSettings(
  userId: string,
  patch: Partial<Omit<AutopilotSettings, 'timezone'>>,
): Promise<AutopilotSettings> {
  const values: Partial<typeof autopilotSettings.$inferInsert> = {}
  if (patch.enabled !== undefined) values.enabled = patch.enabled
  if (patch.cadence !== undefined) values.cadence = patch.cadence
  if (patch.postDays !== undefined) values.postDays = patch.postDays
  if (patch.postTime !== undefined) values.postTime = patch.postTime
  if (patch.triggers !== undefined) values.triggers = patch.triggers
  if (patch.platforms !== undefined) values.platforms = patch.platforms
  if (patch.approvalMode !== undefined) values.approvalMode = patch.approvalMode
  if (patch.reviewerEmails !== undefined) values.reviewerEmails = patch.reviewerEmails
  if (patch.defaultVoiceProfileId !== undefined) values.defaultVoiceProfileId = patch.defaultVoiceProfileId
  if (patch.pausedUntil !== undefined) values.pausedUntil = patch.pausedUntil ? new Date(patch.pausedUntil) : null

  const now = new Date()
  await db
    .insert(autopilotSettings)
    .values({ userId, ...values, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: autopilotSettings.userId, set: { ...values, updatedAt: now } })
  return getAutopilotSettings(userId)
}

/** Records when the planner last ran digests or cadence fill for a user. */
export async function touchAutopilotRun(
  userId: string,
  patch: { lastDigestAt?: Date; lastPlannedAt?: Date },
): Promise<void> {
  if (!patch.lastDigestAt && !patch.lastPlannedAt) return
  await db
    .update(autopilotSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(autopilotSettings.userId, userId))
}

export interface AutopilotUser {
  userId: string
  email: string
  name: string | null
  settings: AutopilotSettings
  lastDigestAt: Date | null
  lastPlannedAt: Date | null
}

/** Users with autopilot on and not paused at `now`. */
export async function listEnabledAutopilotUsers(now: Date, limit = 500): Promise<AutopilotUser[]> {
  const rows = await db
    .select({ settings: autopilotSettings, email: users.email, name: users.name, timezone: userProfiles.timezone })
    .from(autopilotSettings)
    .innerJoin(users, eq(users.id, autopilotSettings.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, autopilotSettings.userId))
    .where(
      and(
        eq(autopilotSettings.enabled, true),
        or(isNull(autopilotSettings.pausedUntil), lt(autopilotSettings.pausedUntil, now)),
      ),
    )
    .orderBy(asc(autopilotSettings.updatedAt))
    .limit(limit)
  return rows.map((r) => ({
    userId: r.settings.userId,
    email: r.email,
    name: r.name,
    settings: rowToSettings(r.settings, r.timezone ?? 'UTC'),
    lastDigestAt: r.settings.lastDigestAt ?? null,
    lastPlannedAt: r.settings.lastPlannedAt ?? null,
  }))
}

/* ─── Queue views ──────────────────────────────────────────────────────── */

const queueSelect = {
  item: queueItems,
  draft: {
    id: postDrafts.id,
    jobId: postDrafts.jobId,
    originalContent: postDrafts.originalContent,
    editedContent: postDrafts.editedContent,
    platformMetadata: postDrafts.platformMetadata,
  },
  job: {
    id: generationJobs.id,
    trigger: generationJobs.trigger,
    sourceType: generationJobs.sourceType,
    sourceRef: generationJobs.sourceRef,
  },
  repoFullName: repos.fullName,
}

type QueueJoinRow = {
  item: QueueItemRow
  draft: {
    id: string
    jobId: string
    originalContent: string
    editedContent: string | null
    platformMetadata: Record<string, unknown>
  }
  job: { id: string; trigger: string; sourceType: string; sourceRef: string | null }
  repoFullName: string | null
}

export function draftHashtags(metadata: Record<string, unknown> | null | undefined): string[] {
  const tags = metadata?.hashtags
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : []
}

export function draftContent(draft: { editedContent: string | null; originalContent: string }): string {
  return draft.editedContent ?? draft.originalContent
}

function fallbackSourceTitle(job: QueueJoinRow['job']): string | null {
  if (job.trigger === 'weekly_digest') return 'Weekly digest'
  if (job.sourceType === 'release' && job.sourceRef) return `Release ${job.sourceRef}`
  if (job.sourceType === 'pr' && job.sourceRef) {
    const m = /\/pull\/(\d+)/.exec(job.sourceRef) ?? /#(\d+)$/.exec(job.sourceRef)
    return m ? `Pull request #${m[1]}` : 'Pull request'
  }
  return null
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function toQueueView(r: QueueJoinRow, titles: Map<string, string>): QueueItemView {
  return {
    id: r.item.id,
    draftId: r.item.draftId,
    jobId: r.draft.jobId,
    repoId: r.item.repoId,
    repoFullName: r.repoFullName ?? 'Disconnected repo',
    platform: r.item.platform === 'twitter' ? 'twitter' : 'linkedin',
    status: r.item.status as QueueStatus,
    content: draftContent(r.draft),
    hashtags: draftHashtags(r.draft.platformMetadata),
    scheduledFor: iso(r.item.scheduledFor),
    approvedAt: iso(r.item.approvedAt),
    publishedAt: iso(r.item.publishedAt),
    publishMethod: (r.item.publishMethod as PublishMethod | null) ?? null,
    externalUrl: r.item.externalUrl,
    lastError: r.item.lastError,
    trigger: (r.job.trigger as JobTrigger) ?? 'manual',
    sourceTitle: titles.get(r.job.id) ?? fallbackSourceTitle(r.job),
    createdAt: r.item.createdAt.toISOString(),
    updatedAt: r.item.updatedAt.toISOString(),
  }
}

async function shipTitlesForJobs(jobIds: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const unique = Array.from(new Set(jobIds))
  if (unique.length === 0) return titles
  const rows = await db
    .select({ jobId: shipEvents.jobId, title: shipEvents.title })
    .from(shipEvents)
    .where(inArray(shipEvents.jobId, unique))
  for (const r of rows) if (r.jobId) titles.set(r.jobId, r.title)
  return titles
}

async function hydrate(rows: QueueJoinRow[]): Promise<QueueItemView[]> {
  const titles = await shipTitlesForJobs(rows.map((r) => r.job.id))
  return rows.map((r) => toQueueView(r, titles))
}

function baseQueueQuery() {
  return db
    .select(queueSelect)
    .from(queueItems)
    .innerJoin(postDrafts, eq(postDrafts.id, queueItems.draftId))
    .innerJoin(generationJobs, eq(generationJobs.id, postDrafts.jobId))
    .leftJoin(repos, eq(repos.id, generationJobs.repoId))
}

export interface ListQueueOptions {
  statuses?: QueueStatus[]
  platform?: PostPlatform
  from?: Date
  to?: Date
  limit?: number
  jobId?: string
}

/** Ordered by scheduled_for ascending (nulls last), then newest first. */
export async function listQueue(userId: string, opts: ListQueueOptions = {}): Promise<QueueItemView[]> {
  const conds = [eq(queueItems.userId, userId), isNull(postDrafts.deletedAt)]
  if (opts.statuses?.length) conds.push(inArray(queueItems.status, opts.statuses))
  if (opts.platform) conds.push(eq(queueItems.platform, opts.platform))
  if (opts.from) conds.push(gte(queueItems.scheduledFor, opts.from))
  if (opts.to) conds.push(lte(queueItems.scheduledFor, opts.to))
  if (opts.jobId) conds.push(eq(postDrafts.jobId, opts.jobId))

  const rows = (await baseQueueQuery()
    .where(and(...conds))
    .orderBy(sql`${queueItems.scheduledFor} asc nulls last`, desc(queueItems.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500))) as QueueJoinRow[]
  return hydrate(rows)
}

export async function getQueueItemView(id: string): Promise<QueueItemView | null> {
  const rows = (await baseQueueQuery().where(eq(queueItems.id, id)).limit(1)) as QueueJoinRow[]
  if (rows.length === 0) return null
  return (await hydrate(rows))[0]
}

export async function getQueueItemByDraft(userId: string, draftId: string): Promise<QueueItemView | null> {
  const rows = (await baseQueueQuery()
    .where(and(eq(queueItems.draftId, draftId), eq(queueItems.userId, userId)))
    .limit(1)) as QueueJoinRow[]
  if (rows.length === 0) return null
  return (await hydrate(rows))[0]
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function getQueueStats(userId: string, now: Date = new Date()): Promise<QueueStats> {
  const [counts] = await db
    .select({
      pendingReview: sql<number>`count(*) filter (where ${queueItems.status} = 'pending_review')`,
      scheduled: sql<number>`count(*) filter (where ${queueItems.status} in ('scheduled', 'approved', 'publishing'))`,
      ready: sql<number>`count(*) filter (where ${queueItems.status} = 'ready')`,
      failed: sql<number>`count(*) filter (where ${queueItems.status} = 'failed')`,
      publishedThisMonth: sql<number>`count(*) filter (where ${queueItems.status} = 'published' and ${queueItems.publishedAt} >= ${startOfUtcMonth(now)})`,
      nextScheduledAt: sql<Date | string | null>`min(${queueItems.scheduledFor}) filter (where ${queueItems.status} = 'scheduled' and ${queueItems.scheduledFor} >= ${now})`,
    })
    .from(queueItems)
    .where(eq(queueItems.userId, userId))

  const next = counts?.nextScheduledAt
  return {
    pendingReview: Number(counts?.pendingReview ?? 0),
    scheduled: Number(counts?.scheduled ?? 0),
    ready: Number(counts?.ready ?? 0),
    failed: Number(counts?.failed ?? 0),
    publishedThisMonth: Number(counts?.publishedThisMonth ?? 0),
    nextScheduledAt: next ? new Date(next).toISOString() : null,
  }
}

/* ─── Queue rows (used by lib/autopilot) ───────────────────────────────── */

export async function getQueueRow(id: string): Promise<QueueItemRow | null> {
  const [row] = await db.select().from(queueItems).where(eq(queueItems.id, id)).limit(1)
  return row ?? null
}

export async function getQueueRowByDraft(draftId: string): Promise<QueueItemRow | null> {
  const [row] = await db.select().from(queueItems).where(eq(queueItems.draftId, draftId)).limit(1)
  return row ?? null
}

export type NewQueueItem = typeof queueItems.$inferInsert

/** Inserts a queue item; when the draft is already queued returns the existing row. */
export async function insertQueueItem(values: NewQueueItem): Promise<QueueItemRow> {
  const [row] = await db.insert(queueItems).values(values).onConflictDoNothing({ target: queueItems.draftId }).returning()
  if (row) return row
  const existing = await getQueueRowByDraft(values.draftId)
  if (!existing) throw new Error(`Queue item for draft ${values.draftId} could not be created`)
  return existing
}

export async function updateQueueItem(id: string, patch: Partial<NewQueueItem>): Promise<QueueItemRow> {
  const [row] = await db
    .update(queueItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(queueItems.id, id))
    .returning()
  return row
}

/**
 * Conditional update: only applies when the item is still in one of
 * `fromStatuses`. Returns null when another worker got there first.
 */
export async function transitionQueueItem(
  id: string,
  fromStatuses: QueueStatus[],
  patch: Partial<NewQueueItem>,
): Promise<QueueItemRow | null> {
  const [row] = await db
    .update(queueItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(queueItems.id, id), inArray(queueItems.status, fromStatuses)))
    .returning()
  return row ?? null
}

/** Times already holding an active item for this user and platform. */
export async function listTakenSlots(userId: string, platform: PostPlatform, from: Date, excludeId?: string): Promise<Date[]> {
  const conds = [
    eq(queueItems.userId, userId),
    eq(queueItems.platform, platform),
    inArray(queueItems.status, ['pending_review', 'approved', 'scheduled', 'ready', 'publishing', 'published']),
    isNotNull(queueItems.scheduledFor),
    gte(queueItems.scheduledFor, from),
  ]
  const rows = await db.select({ id: queueItems.id, at: queueItems.scheduledFor }).from(queueItems).where(and(...conds))
  return rows.filter((r) => r.id !== excludeId && r.at).map((r) => r.at as Date)
}

export async function countActiveQueueItems(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(queueItems)
    .where(and(eq(queueItems.userId, userId), inArray(queueItems.status, [...ACTIVE_QUEUE_STATUSES])))
  return Number(row?.n ?? 0)
}

/** Scheduled items whose time has come (and retries whose backoff elapsed). */
export async function listDueQueueItems(now: Date, limit = 50): Promise<QueueItemRow[]> {
  const stuckBefore = new Date(now.getTime() - 10 * 60_000)
  return db
    .select()
    .from(queueItems)
    .where(
      or(
        and(
          eq(queueItems.status, 'scheduled'),
          lte(queueItems.scheduledFor, now),
          or(isNull(queueItems.nextAttemptAt), lte(queueItems.nextAttemptAt, now)),
        ),
        // A worker that died mid-publish leaves the item in 'publishing'.
        and(eq(queueItems.status, 'publishing'), lt(queueItems.updatedAt, stuckBefore)),
      ),
    )
    .orderBy(asc(queueItems.scheduledFor))
    .limit(limit)
}

/** pending_review items whose slot already passed. */
export async function listOverdueReviewItems(now: Date, limit = 200): Promise<QueueItemRow[]> {
  return db
    .select()
    .from(queueItems)
    .where(and(eq(queueItems.status, 'pending_review'), lt(queueItems.scheduledFor, now)))
    .orderBy(asc(queueItems.scheduledFor))
    .limit(limit)
}

/* ─── Ship events ──────────────────────────────────────────────────────── */

export type NewShipEvent = typeof shipEvents.$inferInsert

/** Inserts a ship event; returns null when it already exists (dedupe key). */
export async function insertShipEvent(values: NewShipEvent): Promise<ShipEventRow | null> {
  const [row] = await db
    .insert(shipEvents)
    .values(values)
    .onConflictDoNothing({ target: [shipEvents.repoId, shipEvents.kind, shipEvents.externalId] })
    .returning()
  return row ?? null
}

export async function updateShipEvent(id: string, patch: Partial<NewShipEvent>): Promise<void> {
  await db.update(shipEvents).set(patch).where(eq(shipEvents.id, id))
}

export async function listShipEvents(userId: string, limit = 20): Promise<ShipEventView[]> {
  const rows = await db
    .select({ event: shipEvents, repoFullName: repos.fullName })
    .from(shipEvents)
    .leftJoin(repos, eq(repos.id, shipEvents.repoId))
    .where(eq(shipEvents.userId, userId))
    .orderBy(desc(shipEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100))
  return rows.map(({ event, repoFullName }) => {
    const skipped = event.metadata?.skipped
    return {
      id: event.id,
      repoFullName: repoFullName ?? 'Disconnected repo',
      kind: (['pr_merged', 'release_published', 'push'].includes(event.kind) ? event.kind : 'push') as ShipEventView['kind'],
      title: event.title,
      url: event.url,
      jobId: event.jobId,
      skippedReason: typeof skipped === 'string' ? skipped : null,
      createdAt: event.createdAt.toISOString(),
    }
  })
}

/* ─── Approval tokens ──────────────────────────────────────────────────── */

export async function insertApprovalTokens(
  rows: {
    userId: string
    queueItemId: string
    tokenHash: string
    email: string
    expiresAt: Date
    actions?: string[]
  }[],
): Promise<void> {
  if (rows.length === 0) return
  await db.insert(approvalTokens).values(rows)
}

export async function findApprovalToken(tokenHash: string) {
  const [row] = await db.select().from(approvalTokens).where(eq(approvalTokens.tokenHash, tokenHash)).limit(1)
  return row ?? null
}

/**
 * Atomically consumes a token: only one caller ever gets `true`, and only
 * while the token is unused and unexpired.
 */
export async function claimApprovalToken(id: string, at: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(approvalTokens)
    .set({ usedAt: at })
    .where(and(eq(approvalTokens.id, id), isNull(approvalTokens.usedAt), sql`${approvalTokens.expiresAt} > ${at}`))
    .returning({ id: approvalTokens.id })
  return rows.length > 0
}

/** Gives a claimed token back (the action it was claimed for could not run). */
export async function releaseApprovalToken(id: string): Promise<void> {
  await db.update(approvalTokens).set({ usedAt: null }).where(eq(approvalTokens.id, id))
}

/* ─── Trials ───────────────────────────────────────────────────────────── */

/** Profiles whose trial ends between `from` and `to`. */
export async function listTrialsEndingBetween(from: Date, to: Date): Promise<{ userId: string; trialEndsAt: Date }[]> {
  const rows = await db
    .select({ userId: userProfiles.userId, trialEndsAt: userProfiles.trialEndsAt })
    .from(userProfiles)
    .where(and(gte(userProfiles.trialEndsAt, from), lte(userProfiles.trialEndsAt, to)))
    .limit(1000)
  return rows.filter((r): r is { userId: string; trialEndsAt: Date } => r.trialEndsAt instanceof Date)
}
