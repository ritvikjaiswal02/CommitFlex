import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { repos, type RepoRow } from '@/lib/db/schema'

export async function createRepo(params: {
  userId: string
  githubRepoId: string
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  repoOwnerType?: 'user' | 'org'
}) {
  const [repo] = await db
    .insert(repos)
    .values({
      userId: params.userId,
      githubRepoId: Number(params.githubRepoId),
      name: params.name,
      fullName: params.fullName,
      url: params.url,
      defaultBranch: params.defaultBranch,
      isPrivate: params.isPrivate,
      repoOwnerType: params.repoOwnerType ?? 'user',
      connectedAt: new Date(),
    })
    .returning()
  return repo
}

export async function getUserRepos(userId: string) {
  return db
    .select()
    .from(repos)
    .where(and(eq(repos.userId, userId), isNull(repos.deletedAt)))
    .orderBy(desc(repos.connectedAt))
}

export async function getRepo(id: string) {
  const [repo] = await db.select().from(repos).where(eq(repos.id, id)).limit(1)
  return repo ?? null
}

/**
 * Look up a connected repo by its GitHub numeric ID. Used by the webhook
 * endpoint where the only stable identifier is `repository.id` from the
 * payload — `fullName` can change on rename.
 */
export async function getRepoByGithubRepoId(githubRepoId: number) {
  const [repo] = await db
    .select()
    .from(repos)
    .where(and(eq(repos.githubRepoId, githubRepoId), isNull(repos.deletedAt)))
    .limit(1)
  return repo ?? null
}

/**
 * Every live connection for a GitHub repo id. Several users (collaborators)
 * can connect the same repository, each with their own webhook and secret;
 * the webhook route picks the row whose secret verifies the signature.
 */
export async function listReposByGithubRepoId(githubRepoId: number): Promise<RepoRow[]> {
  return db
    .select()
    .from(repos)
    .where(and(eq(repos.githubRepoId, githubRepoId), isNull(repos.deletedAt)))
    .orderBy(desc(repos.connectedAt))
    .limit(50)
}

/** The user's live connection for a GitHub repo, if any. */
export async function getUserRepoByGithubId(userId: string, githubRepoId: number): Promise<RepoRow | null> {
  const [repo] = await db
    .select()
    .from(repos)
    .where(and(eq(repos.userId, userId), eq(repos.githubRepoId, githubRepoId), isNull(repos.deletedAt)))
    .limit(1)
  return repo ?? null
}

/** Case-insensitive `owner/name` lookup among the user's connected repos. */
export async function getUserRepoByFullName(userId: string, fullName: string): Promise<RepoRow | null> {
  const [repo] = await db
    .select()
    .from(repos)
    .where(
      and(eq(repos.userId, userId), isNull(repos.deletedAt), sql`lower(${repos.fullName}) = ${fullName.toLowerCase()}`),
    )
    .limit(1)
  return repo ?? null
}

/** Connected repos that autopilot watches. Newest connection first. */
export async function listAutopilotRepos(userId: string): Promise<RepoRow[]> {
  return db
    .select()
    .from(repos)
    .where(and(eq(repos.userId, userId), isNull(repos.deletedAt), eq(repos.autopilotEnabled, true)))
    .orderBy(desc(repos.connectedAt))
}

export async function countAutopilotRepos(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(repos)
    .where(and(eq(repos.userId, userId), isNull(repos.deletedAt), eq(repos.autopilotEnabled, true)))
  return Number(row?.n ?? 0)
}

export async function updateRepoWebhook(
  id: string,
  fields: {
    webhookSecret?: string | null
    webhookId?: number | null
    autoGenerate?: boolean
    webhookEvents?: string[]
  },
) {
  const [repo] = await db.update(repos).set(fields).where(eq(repos.id, id)).returning()
  return repo
}

export async function updateRepoSettings(
  id: string,
  fields: { autoGenerate?: boolean; autopilotEnabled?: boolean },
) {
  const [repo] = await db.update(repos).set(fields).where(eq(repos.id, id)).returning()
  return repo
}

export async function softDeleteRepo(id: string) {
  await db.update(repos).set({ deletedAt: new Date(), isActive: false }).where(eq(repos.id, id))
}

export async function updateLastAnalyzedSha(id: string, sha: string) {
  await db.update(repos).set({ lastAnalyzedCommitSha: sha }).where(eq(repos.id, id))
}

/** Strips webhook secrets and other internals before a repo goes to the client. */
export function toClientRepo(repo: RepoRow) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { webhookSecret, ...rest } = repo
  return { ...rest, webhookConfigured: !!repo.webhookId }
}
