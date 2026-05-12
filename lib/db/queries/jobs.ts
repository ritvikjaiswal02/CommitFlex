import { eq, and, inArray, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { generationJobs } from '@/lib/db/schema'
import type { GenerationJobStatus } from '@/types/jobs'

export async function createJob(params: {
  userId: string
  repoId: string
  windowStart: Date
  windowEnd: Date
}) {
  const [job] = await db.insert(generationJobs).values({
    userId: params.userId,
    repoId: params.repoId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    status: 'queued',
  }).returning()
  return job
}

export async function getJob(id: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1)
  return job ?? null
}

export async function updateJobStatus(id: string, status: GenerationJobStatus, extra?: {
  commitCount?: number
  filteredCount?: number
  errorMessage?: string
  completedAt?: Date
  totalDurationMs?: number
}) {
  await db.update(generationJobs).set({
    status,
    updatedAt: new Date(),
    ...extra,
  }).where(eq(generationJobs.id, id))
}

export async function incrementRetry(id: string) {
  const job = await getJob(id)
  if (!job) throw new Error(`Job ${id} not found`)
  await db.update(generationJobs).set({
    retryCount: job.retryCount + 1,
    updatedAt: new Date(),
  }).where(eq(generationJobs.id, id))
}

export async function hasActiveJob(repoId: string): Promise<boolean> {
  const [row] = await db.select({ id: generationJobs.id })
    .from(generationJobs)
    .where(and(
      eq(generationJobs.repoId, repoId),
      inArray(generationJobs.status, ['queued', 'fetching_commits', 'summarizing', 'extracting_narrative', 'generating_posts'])
    ))
    .limit(1)
  return !!row
}

export async function getUserJobs(userId: string, limit = 20) {
  return db.select().from(generationJobs)
    .where(eq(generationJobs.userId, userId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(limit)
}
