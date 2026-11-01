import { eq, and, isNull, asc, desc } from 'drizzle-orm'
import { createHash } from 'crypto'
import { db } from '@/lib/db/client'
import { generationJobs, postDrafts, queueItems, repos } from '@/lib/db/schema'
import type { DraftWithRepo, QueueStatus } from '@/types/autopilot'
import type { PostPlatform, PostStatus } from '@/types/posts'

export const GENERATION_MODEL = 'gemini-2.5-flash'

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function persistDrafts(
  jobId: string,
  userId: string,
  drafts: Array<{ platform: 'linkedin' | 'twitter'; content: string; hashtags: string[]; callToAction?: string }>,
) {
  if (drafts.length === 0) return []
  const rows = drafts.map((d, i) => ({
    jobId,
    userId,
    generationModel: GENERATION_MODEL,
    platform: d.platform,
    sequenceNumber: i + 1,
    status: 'generated' as const,
    originalContent: d.content,
    contentHash: hashContent(d.content),
    generationStage: `${d.platform}_gen`,
    platformMetadata: { hashtags: d.hashtags, callToAction: d.callToAction } as Record<string, unknown>,
  }))
  return db.insert(postDrafts).values(rows).returning()
}

export async function getDraftsByJob(jobId: string) {
  return db.select().from(postDrafts).where(
    and(eq(postDrafts.jobId, jobId), isNull(postDrafts.deletedAt))
  )
}

export async function getDraft(id: string) {
  const [draft] = await db.select().from(postDrafts).where(eq(postDrafts.id, id)).limit(1)
  return draft ?? null
}

export async function updateDraftContent(id: string, content: string) {
  const [draft] = await db.update(postDrafts).set({
    editedContent: content,
    status: 'edited',
    editedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(postDrafts.id, id)).returning()
  return draft
}

export async function markDraftCopied(id: string) {
  await db.update(postDrafts).set({ status: 'copied', updatedAt: new Date() }).where(eq(postDrafts.id, id))
}

/**
 * Returns all live drafts for a given (job, platform), ordered by sequenceNumber.
 * Used to display variant tabs in the editor.
 */
export async function getDraftVariantsByPlatform(jobId: string, platform: 'linkedin' | 'twitter') {
  return db.select().from(postDrafts)
    .where(and(
      eq(postDrafts.jobId, jobId),
      eq(postDrafts.platform, platform),
      isNull(postDrafts.deletedAt),
    ))
    .orderBy(asc(postDrafts.sequenceNumber))
}

/**
 * Append additional variant drafts for an existing (job, platform). Continues the
 * sequence-number counter from the current max so the UI can tab between them.
 */
export async function appendDraftVariants(
  jobId: string,
  userId: string,
  platform: 'linkedin' | 'twitter',
  variants: Array<{ content: string; hashtags: string[]; callToAction?: string }>,
) {
  if (variants.length === 0) return []
  const [latest] = await db.select({ seq: postDrafts.sequenceNumber }).from(postDrafts)
    .where(and(eq(postDrafts.jobId, jobId), eq(postDrafts.platform, platform)))
    .orderBy(desc(postDrafts.sequenceNumber))
    .limit(1)
  const startSeq = (latest?.seq ?? 0) + 1
  const rows = variants.map((v, i) => ({
    jobId,
    userId,
    generationModel: GENERATION_MODEL,
    platform,
    sequenceNumber: startSeq + i,
    status: 'generated' as const,
    originalContent: v.content,
    contentHash: hashContent(v.content),
    generationStage: `${platform}_variant`,
    platformMetadata: { hashtags: v.hashtags, callToAction: v.callToAction } as Record<string, unknown>,
  }))
  return db.insert(postDrafts).values(rows).returning()
}

export async function replaceDraft(
  id: string,
  jobId: string,
  userId: string,
  draft: { platform: 'linkedin' | 'twitter'; content: string; hashtags: string[] },
) {
  const existing = await getDraft(id)
  if (!existing) throw new Error(`Draft ${id} not found`)
  const [updated] = await db.update(postDrafts).set({
    originalContent: draft.content,
    editedContent: null,
    editedAt: null,
    contentHash: hashContent(draft.content),
    platformMetadata: { hashtags: draft.hashtags } as Record<string, unknown>,
    status: 'generated',
    regenerationCount: existing.regenerationCount + 1,
    updatedAt: new Date(),
  }).where(eq(postDrafts.id, id)).returning()
  return updated
}

export async function setDraftStatus(id: string, status: PostStatus) {
  await db.update(postDrafts).set({ status, updatedAt: new Date() }).where(eq(postDrafts.id, id))
}

/** The draft with its job and repo, for queue actions and the publisher. */
export async function getDraftWithContext(id: string) {
  const [row] = await db
    .select({ draft: postDrafts, job: generationJobs, repoFullName: repos.fullName, repoId: repos.id })
    .from(postDrafts)
    .innerJoin(generationJobs, eq(generationJobs.id, postDrafts.jobId))
    .leftJoin(repos, eq(repos.id, generationJobs.repoId))
    .where(eq(postDrafts.id, id))
    .limit(1)
  return row ?? null
}

/**
 * The user's newest drafts with repo names and queue status. With
 * `unqueuedOnly`, drafts that already have a queue item are left out.
 */
export async function listRecentDrafts(
  userId: string,
  opts: { platform?: PostPlatform; limit?: number; unqueuedOnly?: boolean } = {},
): Promise<DraftWithRepo[]> {
  const conds = [eq(postDrafts.userId, userId), isNull(postDrafts.deletedAt)]
  if (opts.platform) conds.push(eq(postDrafts.platform, opts.platform))
  if (opts.unqueuedOnly) conds.push(isNull(queueItems.id))
  const rows = await db
    .select({
      id: postDrafts.id,
      jobId: postDrafts.jobId,
      platform: postDrafts.platform,
      status: postDrafts.status,
      originalContent: postDrafts.originalContent,
      editedContent: postDrafts.editedContent,
      platformMetadata: postDrafts.platformMetadata,
      createdAt: postDrafts.createdAt,
      repoFullName: repos.fullName,
      queueStatus: queueItems.status,
    })
    .from(postDrafts)
    .innerJoin(generationJobs, eq(generationJobs.id, postDrafts.jobId))
    .leftJoin(repos, eq(repos.id, generationJobs.repoId))
    .leftJoin(queueItems, eq(queueItems.draftId, postDrafts.id))
    .where(and(...conds))
    .orderBy(desc(postDrafts.createdAt), asc(postDrafts.sequenceNumber))
    .limit(Math.min(Math.max(opts.limit ?? 20, 1), 100))

  return rows.map((r) => {
    const tags = (r.platformMetadata as Record<string, unknown> | null)?.hashtags
    return {
      id: r.id,
      jobId: r.jobId,
      platform: r.platform === 'twitter' ? 'twitter' : 'linkedin',
      status: r.status,
      content: r.editedContent ?? r.originalContent,
      hashtags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [],
      repoFullName: r.repoFullName ?? 'Disconnected repo',
      queueStatus: (r.queueStatus as QueueStatus | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    }
  })
}
