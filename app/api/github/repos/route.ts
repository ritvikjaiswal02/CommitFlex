import { auth } from '@/auth'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { createOctokit } from '@/lib/github/client'
import { apiError, unauthorized } from '@/lib/validators/http'

export const dynamic = 'force-dynamic'

/** Enough for anyone; keeps the picker fast and the GitHub calls bounded (5 pages). */
const MAX_REPOS = 500

interface ListedRepo {
  id: number
  name: string
  full_name: string
  html_url: string
  default_branch?: string
  private: boolean
  archived?: boolean
  description: string | null
  language?: string | null
  updated_at?: string | null
  pushed_at?: string | null
  stargazers_count?: number
  fork: boolean
  owner: { login: string; type?: string } | null
  permissions?: { admin?: boolean; push?: boolean } | null
}

/**
 * Every repository the signed-in user can access: their own, ones they
 * collaborate on and their organisations' (when the org allows the OAuth
 * app), most recently pushed first. `canAdmin` says whether CommitFlex can
 * install the webhook with this user's token.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const token = await getGithubAccessToken(session.user.id)
  if (!token) {
    return apiError(400, 'no_github_token', 'No GitHub account connected. Sign out and sign in with GitHub again.')
  }

  try {
    const octokit = createOctokit(token)
    const listed: ListedRepo[] = []
    for await (const page of octokit.paginate.iterator(octokit.repos.listForAuthenticatedUser, {
      affiliation: 'owner,collaborator,organization_member',
      sort: 'pushed',
      per_page: 100,
    })) {
      listed.push(...(page.data as unknown as ListedRepo[]))
      if (listed.length >= MAX_REPOS) break
    }

    const viewer = session.user.login?.toLowerCase() ?? null
    const repos = listed
      .slice(0, MAX_REPOS)
      .filter((r) => !r.archived)
      .map((r) => {
        const ownerType = r.owner?.type === 'Organization' ? 'org' : 'user'
        return {
          githubRepoId: String(r.id),
          name: r.name,
          fullName: r.full_name,
          url: r.html_url,
          defaultBranch: r.default_branch ?? 'main',
          isPrivate: r.private,
          description: r.description,
          language: r.language ?? null,
          updatedAt: r.updated_at ?? null,
          pushedAt: r.pushed_at ?? null,
          stars: r.stargazers_count ?? 0,
          fork: r.fork,
          owner: r.owner?.login ?? r.full_name.split('/')[0],
          ownerType,
          // "Personal" means the signed-in user's own account (not another user's repo they collaborate on).
          personal: ownerType === 'user' && (viewer ? r.owner?.login?.toLowerCase() === viewer : true),
          canAdmin: r.permissions?.admin === true,
          canPush: r.permissions?.admin === true || r.permissions?.push === true,
        }
      })
      .sort((a, b) => (b.pushedAt ?? b.updatedAt ?? '').localeCompare(a.pushedAt ?? a.updatedAt ?? ''))

    return Response.json({
      repos,
      truncated: listed.length >= MAX_REPOS,
      accessUrl: process.env.GITHUB_CLIENT_ID
        ? `https://github.com/settings/connections/applications/${process.env.GITHUB_CLIENT_ID}`
        : 'https://github.com/settings/applications',
    })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401) {
      return apiError(401, 'github_unauthorized', 'GitHub rejected your token. Sign out and sign in with GitHub again.')
    }
    console.error('[github/repos] failed', err)
    return apiError(502, 'upstream_error', 'GitHub did not return your repositories. Try again in a moment.')
  }
}
