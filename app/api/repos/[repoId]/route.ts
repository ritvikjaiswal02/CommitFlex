import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getRepo, softDeleteRepo, updateRepoWebhook } from '@/lib/db/queries/repos'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { createOctokit } from '@/lib/github/client'
import { removeRepoWebhook, splitFullName } from '@/lib/github/webhook'

const PatchSchema = z.object({
  autoGenerate: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: { repoId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireRepoOwner(params.repoId, session.user.id)
    const body = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

    const repo = await updateRepoWebhook(params.repoId, parsed.data)
    return Response.json({ repo })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}

export async function DELETE(_req: Request, { params }: { params: { repoId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireRepoOwner(params.repoId, session.user.id)
    const repo = await getRepo(params.repoId)

    // Best-effort webhook cleanup on the GitHub side. Failures here are non-fatal —
    // the user can always remove the webhook manually from GitHub's settings UI.
    if (repo?.webhookId) {
      try {
        const [account] = await db.select().from(accounts)
          .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
          .limit(1)
        if (account?.access_token) {
          const { owner, repo: repoName } = splitFullName(repo.fullName)
          const octokit = createOctokit(account.access_token)
          await removeRepoWebhook({ octokit, owner, repo: repoName, webhookId: repo.webhookId })
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[repo delete] webhook cleanup failed', err)
      }
    }

    await softDeleteRepo(params.repoId)
    return new Response(null, { status: 204 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}
