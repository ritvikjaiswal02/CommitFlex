import type { Octokit } from '@octokit/rest'
import type { RawCommit } from '@/types/github'

export async function fetchCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  since: Date,
  until: Date,
): Promise<RawCommit[]> {
  const commits: RawCommit[] = []
  let page = 1

  while (true) {
    const { data } = await octokit.repos.listCommits({
      owner,
      repo,
      since: since.toISOString(),
      until: until.toISOString(),
      per_page: 100,
      page,
    })

    if (data.length === 0) break

    for (const c of data) {
      commits.push({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name ?? 'Unknown',
        date: c.commit.author?.date ?? new Date().toISOString(),
        url: c.html_url,
      })
    }

    if (data.length < 100) break
    page++
  }

  return commits
}

export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`Invalid GitHub repo URL: ${repoUrl}`)
  return { owner: match[1], repo: match[2] }
}
