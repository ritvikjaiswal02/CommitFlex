import { sealSecret } from '@/lib/auth/encrypt'
import { auth } from '@/auth'
import { toClientRepo, updateRepoWebhook } from '@/lib/db/queries/repos'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { createOctokit } from '@/lib/github/client'
import {
  WEBHOOK_EVENTS,
  generateWebhookSecret,
  installRepoWebhook,
  splitFullName,
  updateRepoWebhook as updateGithubWebhook,
} from '@/lib/github/webhook'
import { apiError, unauthorized } from '@/lib/validators/http'

function githubMessage(err: unknown): string {
  const e = err as { status?: number; message?: string; response?: { data?: { message?: string } } }
  return e.response?.data?.message ?? e.message ?? 'GitHub returned an error'
}

/**
 * Creates the repo webhook, or switches an existing one to push, pull_request
 * and release with a fresh secret. Repos connected before autopilot only
 * listened to pushes.
 */
export async function POST(_req: Request, { params }: { params: { repoId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  try {
    const repo = await requireRepoOwner(params.repoId, userId)
    const accessToken = await getGithubAccessToken(userId)
    if (!accessToken) {
      return apiError(412, 'no_github_token', 'Your GitHub connection is missing. Sign out and sign in with GitHub again.')
    }

    const { owner, repo: name } = splitFullName(repo.fullName)
    const octokit = createOctokit(accessToken)
    const secret = generateWebhookSecret()
    let webhookId = repo.webhookId

    try {
      if (webhookId) {
        try {
          await updateGithubWebhook({ octokit, owner, repo: name, webhookId, secret })
        } catch (err) {
          if ((err as { status?: number }).status !== 404) throw err
          webhookId = null
        }
      }
      if (!webhookId) webhookId = await installRepoWebhook({ octokit, owner, repo: name, secret })
    } catch (err) {
      const status = (err as { status?: number }).status
      const hint =
        status === 404 || status === 403
          ? ' CommitFlex needs admin access to the repo to add a webhook.'
          : ''
      return apiError(502, 'upstream_error', `GitHub refused the webhook: ${githubMessage(err)}.${hint}`)
    }

    const updated = await updateRepoWebhook(repo.id, {
      webhookId,
      webhookSecret: sealSecret(secret),
      webhookEvents: [...WEBHOOK_EVENTS],
      autoGenerate: true,
    })
    return Response.json({ repo: toClientRepo(updated) })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}
