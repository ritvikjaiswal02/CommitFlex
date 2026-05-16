import type { Octokit } from '@octokit/rest'
import type { RawCommit } from '@/types/github'

/**
 * Pulls out owner/repo/number from a GitHub PR URL. Tolerates both
 * `https://github.com/foo/bar/pull/123` and `foo/bar#123` shorthand.
 */
export function parsePrUrl(input: string): { owner: string; repo: string; number: number } {
  const trimmed = input.trim()
  // Full URL form
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+?)\/pull\/(\d+)/i)
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], number: Number(urlMatch[3]) }
  }
  // Shorthand form: owner/repo#123
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/#\s]+)#(\d+)$/)
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2], number: Number(shortMatch[3]) }
  }
  throw new Error(
    `Couldn't recognise that as a PR — paste the full URL (github.com/owner/repo/pull/123) or owner/repo#123.`,
  )
}

export interface PrSummary {
  number: number
  title: string
  body: string | null
  htmlUrl: string
  mergedAt: string | null
  state: 'open' | 'closed' | 'merged'
}

/**
 * Fetch the PR metadata + every commit attached to it (paginated). PRs cap at
 * 250 commits via the API; anything beyond returns the first 250.
 */
export async function fetchPrCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<{ pr: PrSummary; commits: RawCommit[] }> {
  // The pulls API returns merged_at for merged PRs; state is open|closed.
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: pullNumber })

  const commits: RawCommit[] = []
  let page = 1
  while (true) {
    const { data } = await octokit.pulls.listCommits({
      owner, repo, pull_number: pullNumber, per_page: 100, page,
    })
    if (data.length === 0) break
    for (const c of data) {
      commits.push({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name ?? c.author?.login ?? 'Unknown',
        date: c.commit.author?.date ?? new Date().toISOString(),
        url: c.html_url,
      })
    }
    if (data.length < 100) break
    page++
  }

  return {
    pr: {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? null,
      htmlUrl: pr.html_url,
      mergedAt: pr.merged_at,
      state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
    },
    commits,
  }
}
