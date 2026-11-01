import { z } from 'zod'
import { auth } from '@/auth'
import { countAutopilotRepos, getRepo, softDeleteRepo, toClientRepo, updateRepoSettings } from '@/lib/db/queries/repos'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { createOctokit } from '@/lib/github/client'
import { removeRepoWebhook, splitFullName } from '@/lib/github/webhook'
import { PlanError, getUserPlan, limitFor, limitReachedBody, planErrorToResponse } from '@/lib/plans'
import { invalidRequest, readJson, unauthorized } from '@/lib/validators/http'

const PatchSchema = z
  .object({
    autoGenerate: z.boolean().optional(),
    autopilotEnabled: z.boolean().optional(),
  })
  .strict()

export async function PATCH(req: Request, { params }: { params: { repoId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  try {
    const repo = await requireRepoOwner(params.repoId, userId)
    const parsed = PatchSchema.safeParse(await readJson(req))
    if (!parsed.success) return invalidRequest(parsed.error)

    if (parsed.data.autopilotEnabled === true && !repo.autopilotEnabled) {
      const [plan, used] = await Promise.all([getUserPlan(userId), countAutopilotRepos(userId)])
      const max = limitFor(plan.id, 'repos')
      if (used + 1 > max) throw new PlanError(limitReachedBody('repos', used, max, plan.id))
    }

    const updated = await updateRepoSettings(params.repoId, parsed.data)
    return Response.json({ repo: toClientRepo(updated) })
  } catch (err) {
    const res = ownershipErrorToResponse(err) ?? planErrorToResponse(err)
    if (res) return res
    throw err
  }
}

export async function DELETE(_req: Request, { params }: { params: { repoId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  try {
    await requireRepoOwner(params.repoId, userId)
    const repo = await getRepo(params.repoId)

    // Best-effort webhook cleanup on GitHub. Failures are non-fatal: the user
    // can always remove the webhook from GitHub's settings.
    if (repo?.webhookId) {
      try {
        const accessToken = await getGithubAccessToken(userId)
        if (accessToken) {
          const { owner, repo: repoName } = splitFullName(repo.fullName)
          await removeRepoWebhook({ octokit: createOctokit(accessToken), owner, repo: repoName, webhookId: repo.webhookId })
        }
      } catch (err) {
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
