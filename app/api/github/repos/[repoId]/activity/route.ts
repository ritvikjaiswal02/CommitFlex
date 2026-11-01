import { auth } from '@/auth'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { listDraftedSources } from '@/lib/db/queries/jobs'
import { createOctokit } from '@/lib/github/client'
import { getRecentActivity } from '@/lib/github/recent'
import { apiError, unauthorized } from '@/lib/validators/http'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/repos/:repoId/activity
 * The last 20 merged pull requests and the last 10 releases (or tags) of a
 * connected repo, each flagged when CommitFlex already drafted about it, so
 * "Draft a post" can offer a picker instead of a paste box.
 */
export async function GET(_req: Request, { params }: { params: { repoId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  let repo
  try {
    repo = await requireRepoOwner(params.repoId, userId)
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
  if (repo.deletedAt) return apiError(404, 'not_found', 'That repository is not connected.')

  const token = await getGithubAccessToken(userId)
  if (!token) return apiError(412, 'no_github_token', 'Your GitHub connection is missing. Sign out and sign in with GitHub again.')

  try {
    const [activity, drafted] = await Promise.all([
      getRecentActivity(createOctokit(token), repo.fullName),
      listDraftedSources(repo.id),
    ])
    return Response.json(
      {
        pullRequests: activity.pullRequests.map((pr) => ({ ...pr, drafted: drafted.prs.has(pr.number) })),
        releases: activity.releases.map((r) => ({ ...r, drafted: drafted.tags.has(r.tag) })),
      },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    )
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401) {
      return apiError(401, 'github_unauthorized', 'GitHub rejected your token. Sign out and sign in with GitHub again.')
    }
    console.error('[github/activity] failed', err)
    return apiError(502, 'upstream_error', "GitHub didn't return this repository's pull requests. Try again in a moment.")
  }
}
