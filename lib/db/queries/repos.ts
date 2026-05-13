import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { repos } from '@/lib/db/schema'

export async function createRepo(params: {
  userId: string
  githubRepoId: string
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
}) {
  const [repo] = await db.insert(repos).values({
    userId: params.userId,
    githubRepoId: Number(params.githubRepoId),
    name: params.name,
    fullName: params.fullName,
    url: params.url,
    defaultBranch: params.defaultBranch,
    isPrivate: params.isPrivate,
    connectedAt: new Date(),
  }).returning()
  return repo
}

export async function getUserRepos(userId: string) {
  return db.select().from(repos).where(
    and(eq(repos.userId, userId), isNull(repos.deletedAt))
  )
}

export async function getRepo(id: string) {
  const [repo] = await db.select().from(repos).where(eq(repos.id, id)).limit(1)
  return repo ?? null
}

/**
 * Look up a connected repo by its GitHub numeric ID. Used by the webhook
 * endpoint where the only stable identifier is `repository.id` from the
 * push payload — `fullName` can change on rename.
 */
export async function getRepoByGithubRepoId(githubRepoId: number) {
  const [repo] = await db.select().from(repos)
    .where(and(eq(repos.githubRepoId, githubRepoId), isNull(repos.deletedAt)))
    .limit(1)
  return repo ?? null
}

export async function updateRepoWebhook(id: string, fields: {
  webhookSecret?: string | null
  webhookId?: number | null
  autoGenerate?: boolean
}) {
  const [repo] = await db.update(repos).set(fields).where(eq(repos.id, id)).returning()
  return repo
}

export async function softDeleteRepo(id: string) {
  await db.update(repos).set({ deletedAt: new Date(), isActive: false }).where(eq(repos.id, id))
}

export async function updateLastAnalyzedSha(id: string, sha: string) {
  await db.update(repos).set({ lastAnalyzedCommitSha: sha }).where(eq(repos.id, id))
}
