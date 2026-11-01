import type { Octokit } from '@octokit/rest'
import { createOctokit } from './client'
import { filterCommits } from './filter'
import { splitFullName } from './webhook'
import type { RawCommit } from '@/types/github'

export interface RepoActivity {
  /** Commits left after filterCommits (no merges, bots, chores). */
  meaningful: number
  latestAt: Date | null
}

/**
 * Counts meaningful commits on the default branch in a window. Reads at most
 * one page (100 commits), which is plenty to decide whether a week is worth a
 * post. Returns zero activity when GitHub refuses (repo gone, token revoked).
 */
export async function getRepoActivity(
  input: { accessToken: string; fullName: string; since: Date; until?: Date; octokit?: Octokit },
): Promise<RepoActivity> {
  const octokit = input.octokit ?? createOctokit(input.accessToken)
  const { owner, repo } = splitFullName(input.fullName)
  try {
    const { data } = await octokit.repos.listCommits({
      owner,
      repo,
      since: input.since.toISOString(),
      until: (input.until ?? new Date()).toISOString(),
      per_page: 100,
    })
    const commits: RawCommit[] = data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name ?? c.author?.login ?? 'Unknown',
      date: c.commit.author?.date ?? new Date().toISOString(),
      url: c.html_url,
    }))
    const { commits: kept } = filterCommits(commits)
    const latest = kept.reduce<number>((max, c) => Math.max(max, new Date(c.date).getTime() || 0), 0)
    return { meaningful: kept.length, latestAt: latest ? new Date(latest) : null }
  } catch (err) {
    const status = (err as { status?: number }).status
    // 409 = empty repository. Anything else is logged and treated as no activity.
    if (status !== 409) console.warn(`[github] activity check failed for ${input.fullName}`, status ?? err)
    return { meaningful: 0, latestAt: null }
  }
}
