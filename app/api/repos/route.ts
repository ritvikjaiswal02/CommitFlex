import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getUserRepos, createRepo, updateRepoWebhook } from '@/lib/db/queries/repos'
import { createOctokit } from '@/lib/github/client'
import {
  generateWebhookSecret,
  installRepoWebhook,
  splitFullName,
} from '@/lib/github/webhook'

const CreateRepoSchema = z.object({
  githubRepoId: z.string(),
  name: z.string().min(1),
  fullName: z.string().min(1),
  url: z.string().url(),
  defaultBranch: z.string().default('main'),
  isPrivate: z.boolean().default(false),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const repos = await getUserRepos(session.user.id)
  return Response.json({ repos })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = CreateRepoSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const repo = await createRepo({ ...parsed.data, userId: session.user.id })

  // Best-effort webhook install. Failures here (e.g. user denied
  // admin:repo_hook scope, or GitHub returned 422) do NOT block the connect —
  // we flip autoGenerate off and surface a warning instead.
  let webhookWarning: string | null = null
  try {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)
    if (!account?.access_token) throw new Error('Missing GitHub access token')

    const { owner, repo: repoName } = splitFullName(repo.fullName)
    const secret = generateWebhookSecret()
    const octokit = createOctokit(account.access_token)
    const webhookId = await installRepoWebhook({ octokit, owner, repo: repoName, secret })

    await updateRepoWebhook(repo.id, { webhookSecret: secret, webhookId, autoGenerate: true })
    return Response.json({ repo: { ...repo, webhookId, autoGenerate: true } }, { status: 201 })
  } catch (err) {
    webhookWarning = err instanceof Error ? err.message : String(err)
    await updateRepoWebhook(repo.id, { autoGenerate: false })
  }

  return Response.json({
    repo: { ...repo, autoGenerate: false },
    warning: `Webhook install failed: ${webhookWarning}. Manual generation still works.`,
  }, { status: 201 })
}
