/**
 * Connecting a repository, shared by POST /api/repos (app) and
 * POST /api/extension/repos (extension).
 *
 * Nothing about the repository is taken from the client except which one it
 * is. The repo is read from GitHub with the user's own token, so a user can
 * only connect a repo their GitHub account can push to, and the name, URL,
 * default branch and visibility are GitHub's, not the request body's.
 */
import type { Octokit } from '@octokit/rest'
import { createRepo, getUserRepoByGithubId, updateRepoWebhook } from '@/lib/db/queries/repos'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { createOctokit } from '@/lib/github/client'
import { WEBHOOK_EVENTS, generateWebhookSecret, installRepoWebhook } from '@/lib/github/webhook'
import { sealSecret } from '@/lib/auth/encrypt'
import { assertWithinLimit } from '@/lib/plans'
import type { RepoRow } from '@/lib/db/schema'

export type RepoSelector = { githubRepoId: number } | { fullName: string }

export class RepoConnectError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'RepoConnectError'
  }
}

export interface GithubRepoFacts {
  githubRepoId: number
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  ownerType: 'user' | 'org'
  canAdmin: boolean
  canPush: boolean
}

interface GithubRepoData {
  id: number
  name: string
  full_name: string
  html_url: string
  default_branch?: string
  private: boolean
  archived?: boolean
  owner?: { type?: string } | null
  permissions?: { admin?: boolean; push?: boolean } | null
}

export function toRepoFacts(data: GithubRepoData): GithubRepoFacts {
  return {
    githubRepoId: data.id,
    name: data.name,
    fullName: data.full_name,
    url: data.html_url,
    defaultBranch: data.default_branch || 'main',
    isPrivate: data.private,
    ownerType: data.owner?.type === 'Organization' ? 'org' : 'user',
    canAdmin: data.permissions?.admin === true,
    canPush: data.permissions?.admin === true || data.permissions?.push === true,
  }
}

/** Reads the repository from GitHub as the user. 404 when they can't see it. */
export async function fetchRepoFacts(octokit: Octokit, selector: RepoSelector): Promise<GithubRepoFacts> {
  try {
    if ('githubRepoId' in selector) {
      const { data } = await octokit.request('GET /repositories/{id}', { id: selector.githubRepoId })
      return toRepoFacts(data as GithubRepoData)
    }
    const [owner, repo] = selector.fullName.split('/')
    const { data } = await octokit.repos.get({ owner, repo })
    return toRepoFacts(data as GithubRepoData)
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404 || status === 403) {
      throw new RepoConnectError(404, 'not_found', "GitHub doesn't show that repository to your account.")
    }
    if (status === 401) {
      throw new RepoConnectError(401, 'github_unauthorized', 'GitHub rejected your token. Sign out and sign in with GitHub again.')
    }
    throw err
  }
}

export interface ConnectResult {
  repo: RepoRow
  /** Set when the repo connected but the webhook could not be installed. */
  warning: string | null
}

/**
 * Connects the repo for the user and installs the webhook. Throws
 * RepoConnectError for expected failures and PlanError at the repo limit.
 */
export async function connectRepo(userId: string, selector: RepoSelector): Promise<ConnectResult> {
  const accessToken = await getGithubAccessToken(userId)
  if (!accessToken) {
    throw new RepoConnectError(412, 'no_github_token', 'Your GitHub connection is missing. Sign out and sign in with GitHub again.')
  }
  const octokit = createOctokit(accessToken)
  const facts = await fetchRepoFacts(octokit, selector)
  if (!facts.canPush) {
    throw new RepoConnectError(
      403,
      'no_access',
      `You can read ${facts.fullName} but not push to it. Ask an owner to connect it, or to give you write access.`,
    )
  }

  const existing = await getUserRepoByGithubId(userId, facts.githubRepoId)
  if (existing) {
    throw new RepoConnectError(409, 'already_connected', `${existing.fullName} is already connected.`, { repo: existing })
  }
  await assertWithinLimit(userId, 'repos')

  const repo = await createRepo({
    userId,
    githubRepoId: String(facts.githubRepoId),
    name: facts.name,
    fullName: facts.fullName,
    url: facts.url,
    defaultBranch: facts.defaultBranch,
    isPrivate: facts.isPrivate,
    repoOwnerType: facts.ownerType,
  })

  if (!facts.canAdmin) {
    await updateRepoWebhook(repo.id, { autoGenerate: false })
    return {
      repo: { ...repo, autoGenerate: false },
      warning: `You don't have admin access to ${facts.fullName}, so CommitFlex couldn't add the webhook. Drafts you start yourself and the weekly digest still work; ask an owner for admin access to draft from merged pull requests and releases.`,
    }
  }

  try {
    const [owner, name] = facts.fullName.split('/')
    const secret = generateWebhookSecret()
    const webhookId = await installRepoWebhook({ octokit, owner, repo: name, secret })
    const updated = await updateRepoWebhook(repo.id, {
      webhookSecret: sealSecret(secret),
      webhookId,
      autoGenerate: true,
      webhookEvents: [...WEBHOOK_EVENTS],
    })
    return { repo: updated ?? { ...repo, webhookId, autoGenerate: true }, warning: null }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await updateRepoWebhook(repo.id, { autoGenerate: false })
    return {
      repo: { ...repo, autoGenerate: false },
      warning: `We couldn't add the GitHub webhook (${reason}). Merged pull requests and releases won't reach CommitFlex until you add it from Repositories. Manual drafts and the weekly digest still work.`,
    }
  }
}
