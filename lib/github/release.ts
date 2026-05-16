import type { Octokit } from '@octokit/rest'
import type { RawCommit } from '@/types/github'

/**
 * Fetch every commit between the prior release tag and `tag`. If `tag` is the
 * first ever release, falls back to all commits up to that tag.
 *
 * Returns commits sorted oldest → newest, mirroring `fetchCommits` from the
 * window-based path so downstream stages don't have to care which source ran.
 */
export async function fetchCommitsForTag(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
): Promise<{ commits: RawCommit[]; previousTag: string | null }> {
  // Resolve the previous tag by ordering tags by commit date.
  const tagsResp = await octokit.repos.listTags({ owner, repo, per_page: 100 })
  const tags = tagsResp.data.map(t => t.name)
  const idx = tags.indexOf(tag)
  if (idx === -1) {
    throw new Error(`Tag "${tag}" not found on ${owner}/${repo}.`)
  }
  // Tags from listTags are in reverse chronological order — so the *next* item
  // in the array is the previous release.
  const previousTag = tags[idx + 1] ?? null

  let rawCommits: { sha: string; commit: { message: string; author?: { name?: string; date?: string } | null }; html_url: string; author?: { login?: string } | null }[] = []

  if (previousTag) {
    // compareCommits gives us exactly the diff between two refs.
    const { data } = await octokit.repos.compareCommits({
      owner, repo, base: previousTag, head: tag,
    })
    rawCommits = data.commits as typeof rawCommits
  } else {
    // First-ever tag: walk commits ending at the tag's commit SHA. Paginate
    // because there could be a lot.
    let page = 1
    while (true) {
      const { data } = await octokit.repos.listCommits({
        owner, repo, sha: tag, per_page: 100, page,
      })
      if (data.length === 0) break
      rawCommits.push(...(data as typeof rawCommits))
      if (data.length < 100) break
      page++
    }
  }

  const commits: RawCommit[] = rawCommits.map(c => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? c.author?.login ?? 'Unknown',
    date: c.commit.author?.date ?? new Date().toISOString(),
    url: c.html_url,
  }))

  return { commits, previousTag }
}
