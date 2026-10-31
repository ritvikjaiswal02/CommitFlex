/**
 * Publish log and the analytics built on the queue.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { generationJobs, postDrafts, publishLog, queueItems, shipEvents } from '@/lib/db/schema'
import type { ShipOutcome } from '@/lib/insights'
import { JOB_TRIGGERS, type JobTrigger, type PublishMethod } from '@/types/autopilot'
import { getUserTimezone } from '@/lib/db/queries/autopilot'
import { localDateKey } from '@/lib/autopilot/slots'

export async function insertPublishLog(input: {
  userId: string
  queueItemId: string | null
  draftId: string | null
  platform: string
  method: PublishMethod
  /** null records an intent: the API call is about to happen, outcome unknown. */
  success: boolean | null
  statusCode?: number | null
  externalPostId?: string | null
  error?: string | null
}): Promise<string | null> {
  const [row] = await db
    .insert(publishLog)
    .values({
      userId: input.userId,
      queueItemId: input.queueItemId,
      draftId: input.draftId,
      platform: input.platform,
      method: input.method,
      success: input.success,
      statusCode: input.statusCode ?? null,
      externalPostId: input.externalPostId ?? null,
      error: input.error ? input.error.slice(0, 2000) : null,
    })
    .returning({ id: publishLog.id })
  return row?.id ?? null
}

/** Records the outcome on an intent row written before the API call. */
export async function resolvePublishIntent(
  id: string,
  outcome: { success: boolean; statusCode?: number | null; externalPostId?: string | null; error?: string | null },
): Promise<void> {
  await db
    .update(publishLog)
    .set({
      success: outcome.success,
      statusCode: outcome.statusCode ?? null,
      externalPostId: outcome.externalPostId ?? null,
      error: outcome.error ? outcome.error.slice(0, 2000) : null,
    })
    .where(eq(publishLog.id, id))
}

/**
 * True when an API call for this item started and never recorded an
 * outcome: the post may already be live, so it must not be sent again.
 */
export async function hasOpenPublishIntent(queueItemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: publishLog.id })
    .from(publishLog)
    .where(and(eq(publishLog.queueItemId, queueItemId), isNull(publishLog.success)))
    .limit(1)
  return !!row
}

export interface PublishStats {
  byDay: { date: string; linkedin: number; twitter: number }[]
  byTrigger: { trigger: JobTrigger; count: number }[]
  byMethod: { method: PublishMethod; count: number }[]
  totals: { published: number; failed: number; drafted: number; approved: number }
}

const METHODS: readonly PublishMethod[] = ['linkedin_api', 'x_intent', 'extension', 'manual']

/** Every calendar day (in the user's timezone) from `from` to `to`, inclusive. */
export function dayKeysBetween(from: Date, to: Date, timezone: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  // Step in 12h increments so DST shifts can't skip a calendar day.
  for (let t = from.getTime(); t <= to.getTime(); t += 12 * 3600_000) {
    const key = localDateKey(new Date(t), timezone)
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }
  const last = localDateKey(to, timezone)
  if (!seen.has(last)) keys.push(last)
  return keys
}

export async function getPublishStats(userId: string, opts: { from: Date; to: Date }): Promise<PublishStats> {
  const { from, to } = opts
  const timezone = await getUserTimezone(userId)

  const [published, failedRow, draftedRow, approvedRow] = await Promise.all([
    db
      .select({
        platform: queueItems.platform,
        publishedAt: queueItems.publishedAt,
        method: queueItems.publishMethod,
        trigger: generationJobs.trigger,
      })
      .from(queueItems)
      .innerJoin(postDrafts, eq(postDrafts.id, queueItems.draftId))
      .innerJoin(generationJobs, eq(generationJobs.id, postDrafts.jobId))
      .where(
        and(
          eq(queueItems.userId, userId),
          eq(queueItems.status, 'published'),
          gte(queueItems.publishedAt, from),
          lte(queueItems.publishedAt, to),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(queueItems)
      .where(
        and(
          eq(queueItems.userId, userId),
          eq(queueItems.status, 'failed'),
          gte(queueItems.updatedAt, from),
          lte(queueItems.updatedAt, to),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(postDrafts)
      .where(and(eq(postDrafts.userId, userId), gte(postDrafts.createdAt, from), lte(postDrafts.createdAt, to))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(queueItems)
      .where(and(eq(queueItems.userId, userId), gte(queueItems.approvedAt, from), lte(queueItems.approvedAt, to))),
  ])

  const days = new Map<string, { linkedin: number; twitter: number }>()
  for (const key of dayKeysBetween(from, to, timezone)) days.set(key, { linkedin: 0, twitter: 0 })
  const triggerCounts = new Map<JobTrigger, number>()
  const methodCounts = new Map<PublishMethod, number>()

  for (const row of published) {
    if (row.publishedAt) {
      const key = localDateKey(row.publishedAt, timezone)
      const bucket = days.get(key) ?? { linkedin: 0, twitter: 0 }
      if (row.platform === 'twitter') bucket.twitter++
      else bucket.linkedin++
      days.set(key, bucket)
    }
    const trigger = ((JOB_TRIGGERS as readonly string[]).includes(row.trigger) ? row.trigger : 'manual') as JobTrigger
    triggerCounts.set(trigger, (triggerCounts.get(trigger) ?? 0) + 1)
    const method = ((METHODS as readonly string[]).includes(row.method ?? '') ? row.method : 'manual') as PublishMethod
    methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1)
  }

  return {
    byDay: Array.from(days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
    byTrigger: Array.from(triggerCounts.entries())
      .map(([trigger, count]) => ({ trigger, count }))
      .sort((a, b) => b.count - a.count),
    byMethod: Array.from(methodCounts.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count),
    totals: {
      published: published.length,
      failed: Number(failedRow[0]?.n ?? 0),
      drafted: Number(draftedRow[0]?.n ?? 0),
      approved: Number(approvedRow[0]?.n ?? 0),
    },
  }
}

/* ─── Consistency (Insights) ───────────────────────────────────────────── */

/** Publish times of the user's posts since `since` (for streaks). */
export async function listPublishedTimes(userId: string, since: Date): Promise<Date[]> {
  const rows = await db
    .select({ at: queueItems.publishedAt })
    .from(queueItems)
    .where(and(eq(queueItems.userId, userId), eq(queueItems.status, 'published'), gte(queueItems.publishedAt, since)))
  return rows.map((r) => r.at).filter((d): d is Date => d instanceof Date)
}

/**
 * Ship moments (merged PRs and releases) in a range, each with the first
 * time a post written from it was published. A ship event links to its job;
 * the job's drafts link to queue items.
 */
export async function listShipOutcomes(userId: string, opts: { from: Date; to: Date }): Promise<ShipOutcome[]> {
  const rows = await db
    .select({
      id: shipEvents.id,
      createdAt: shipEvents.createdAt,
      metadata: shipEvents.metadata,
      firstPublishedAt: sql<Date | string | null>`min(${queueItems.publishedAt}) filter (where ${queueItems.status} = 'published')`,
    })
    .from(shipEvents)
    .leftJoin(postDrafts, eq(postDrafts.jobId, shipEvents.jobId))
    .leftJoin(queueItems, eq(queueItems.draftId, postDrafts.id))
    .where(
      and(
        eq(shipEvents.userId, userId),
        inArray(shipEvents.kind, ['pr_merged', 'release_published']),
        gte(shipEvents.createdAt, opts.from),
        lte(shipEvents.createdAt, opts.to),
      ),
    )
    .groupBy(shipEvents.id, shipEvents.createdAt, shipEvents.metadata)
  return rows.map((r) => ({
    shippedAt: r.createdAt,
    firstPublishedAt: r.firstPublishedAt ? new Date(r.firstPublishedAt) : null,
    skipped: typeof (r.metadata as Record<string, unknown> | null)?.skipped === 'string',
  }))
}
