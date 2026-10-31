import { eq, and, inArray, desc, gte, lt, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { generationJobs, type JobPrefetch } from '@/lib/db/schema'
import { ACTIVE_JOB_STATUSES, type GenerationJobStatus } from '@/types/jobs'
import type { JobTrigger } from '@/types/autopilot'

export type JobSourceType = 'window' | 'pr' | 'release'

export async function createJob(params: {
  userId: string
  repoId: string
  windowStart: Date
  windowEnd: Date
  sourceType?: JobSourceType
  sourceRef?: string | null
  trigger?: JobTrigger
  voiceProfileId?: string | null
  autoQueue?: boolean
  awaitingInput?: boolean
}) {
  const [job] = await db
    .insert(generationJobs)
    .values({
      userId: params.userId,
      repoId: params.repoId,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      sourceType: params.sourceType ?? 'window',
      sourceRef: params.sourceRef ?? null,
      trigger: params.trigger ?? 'manual',
      voiceProfileId: params.voiceProfileId ?? null,
      autoQueue: params.autoQueue ?? false,
      awaitingInput: params.awaitingInput ?? false,
      status: 'queued',
    })
    .returning()
  return job
}

const ACTIVE_STALE_MS = 30 * 60_000

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export type CreateJobParams = Parameters<typeof createJob>[0]

/**
 * Creates a job unless the repo already has a live one. The partial unique
 * index generation_jobs_active_repo_uidx makes this atomic: when two callers
 * race, the loser gets the winner's id back. A live job that hasn't moved in
 * 30 minutes is a dead worker; it is closed and the insert retried once.
 */
export async function createJobExclusive(
  params: CreateJobParams,
): Promise<{ ok: true; job: Awaited<ReturnType<typeof createJob>> } | { ok: false; activeJobId: string | null }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { ok: true, job: await createJob(params) }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const [live] = await db
        .select({ id: generationJobs.id, updatedAt: generationJobs.updatedAt })
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.repoId, params.repoId),
            notInArray(generationJobs.status, ['completed', 'partial_completed', 'failed', 'cancelled']),
          ),
        )
        .limit(1)
      if (!live) continue
      if (attempt === 0 && live.updatedAt.getTime() < Date.now() - ACTIVE_STALE_MS) {
        await db
          .update(generationJobs)
          .set({ status: 'failed', errorMessage: 'The run stopped responding.', updatedAt: new Date(), completedAt: new Date() })
          .where(and(eq(generationJobs.id, live.id), lt(generationJobs.updatedAt, new Date(Date.now() - ACTIVE_STALE_MS))))
        continue
      }
      return { ok: false, activeJobId: live.id }
    }
  }
  return { ok: false, activeJobId: null }
}

export async function getJob(id: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1)
  return job ?? null
}

export async function updateJobStatus(
  id: string,
  status: GenerationJobStatus,
  extra?: {
    commitCount?: number
    filteredCount?: number
    errorMessage?: string | null
    completedAt?: Date
    totalDurationMs?: number
  },
) {
  await db
    .update(generationJobs)
    .set({
      status,
      updatedAt: new Date(),
      ...extra,
    })
    .where(eq(generationJobs.id, id))
}

export async function incrementRetry(id: string) {
  await db
    .update(generationJobs)
    .set({
      retryCount: sql`${generationJobs.retryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(generationJobs.id, id))
}

/** The repo's running job, if any (jobs older than 30 minutes are treated as dead). */
export async function getActiveJob(repoId: string): Promise<{ id: string } | null> {
  const staleBefore = new Date(Date.now() - 30 * 60_000)
  const [row] = await db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.repoId, repoId),
        inArray(generationJobs.status, [...ACTIVE_JOB_STATUSES]),
        gte(generationJobs.updatedAt, staleBefore),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function hasActiveJob(repoId: string): Promise<boolean> {
  return (await getActiveJob(repoId)) !== null
}

export async function hasActiveJobForUser(userId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - 30 * 60_000)
  const [row] = await db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, userId),
        inArray(generationJobs.status, [...ACTIVE_JOB_STATUSES]),
        gte(generationJobs.updatedAt, staleBefore),
      ),
    )
    .limit(1)
  return !!row
}

export async function getUserJobs(userId: string, limit = 20) {
  return db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.userId, userId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(limit)
}

/** Repo ids that had a job created since `since`. */
export async function listReposWithJobsSince(userId: string, since: Date): Promise<Set<string>> {
  const rows = await db
    .select({ repoId: generationJobs.repoId })
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, userId), gte(generationJobs.createdAt, since)))
  return new Set(rows.map((r) => r.repoId))
}

/* ─── Onboarding prefetch ──────────────────────────────────────────────── */

/** Stores the prefetch result and parks the job until the answers arrive. */
export async function savePrefetch(id: string, prefetch: JobPrefetch, commitCount: number): Promise<void> {
  await db
    .update(generationJobs)
    .set({ status: 'prefetched', prefetch, commitCount, updatedAt: new Date() })
    .where(eq(generationJobs.id, id))
}

/** /api/onboarding/complete: the answers are in; record the voice to write with. */
export async function releasePrefetchedJob(id: string, voiceProfileId: string | null): Promise<void> {
  await db
    .update(generationJobs)
    .set({ awaitingInput: false, voiceProfileId, updatedAt: new Date() })
    .where(eq(generationJobs.id, id))
}

/**
 * Moves a parked job on to writing. Conditional on 'prefetched' and no
 * longer awaiting input, so exactly one caller (the prefetch run finishing
 * or /complete arriving) continues it. Returns the job row when claimed.
 */
export async function claimPrefetchedJob(id: string) {
  const [row] = await db
    .update(generationJobs)
    .set({ status: 'extracting_narrative', updatedAt: new Date() })
    .where(and(eq(generationJobs.id, id), eq(generationJobs.status, 'prefetched'), eq(generationJobs.awaitingInput, false)))
    .returning()
  return row ?? null
}

/** The user's onboarding prefetch job that is still usable, if any. */
export async function getOnboardingPrefetchJob(userId: string, repoId?: string) {
  const conds = [
    eq(generationJobs.userId, userId),
    eq(generationJobs.trigger, 'onboarding'),
    eq(generationJobs.awaitingInput, true),
    inArray(generationJobs.status, ['queued', 'fetching_commits', 'summarizing', 'prefetched']),
    gte(generationJobs.updatedAt, new Date(Date.now() - ACTIVE_STALE_MS)),
  ]
  if (repoId) conds.push(eq(generationJobs.repoId, repoId))
  const [row] = await db
    .select()
    .from(generationJobs)
    .where(and(...conds))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Pull request numbers and release tags this repo already has drafts for
 * (any run that didn't fail), so pickers can preselect what's new.
 */
export async function listDraftedSources(repoId: string): Promise<{ prs: Set<number>; tags: Set<string> }> {
  const rows = await db
    .select({ sourceType: generationJobs.sourceType, sourceRef: generationJobs.sourceRef })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.repoId, repoId),
        inArray(generationJobs.sourceType, ['pr', 'release']),
        notInArray(generationJobs.status, ['failed', 'cancelled']),
      ),
    )
    .orderBy(desc(generationJobs.createdAt))
    .limit(200)
  const prs = new Set<number>()
  const tags = new Set<string>()
  for (const row of rows) {
    if (!row.sourceRef) continue
    if (row.sourceType === 'release') tags.add(row.sourceRef)
    else {
      const m = /\/pull\/(\d+)/.exec(row.sourceRef) ?? /#(\d+)$/.exec(row.sourceRef)
      if (m) prs.add(Number(m[1]))
    }
  }
  return { prs, tags }
}
