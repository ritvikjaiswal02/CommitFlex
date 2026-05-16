import { createOctokit } from '@/lib/github/client'
import { fetchCommits, parseRepoUrl } from '@/lib/github/commits'
import { fetchPrCommits, parsePrUrl } from '@/lib/github/pr'
import { fetchCommitsForTag } from '@/lib/github/release'
import { filterCommits } from '@/lib/github/filter'
import { sanitizeCommits } from '@/lib/github/sanitize'
import { persistCommitSnapshots } from '@/lib/db/queries/snapshots'
import { emitEvent } from '@/lib/db/queries/events'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import type { GenerationJob } from '@/types/jobs'
import type { RawCommit } from '@/types/github'

export async function stageFetch(job: GenerationJob, repoUrl: string, accessToken: string): Promise<RawCommit[]> {
  await updateJobStatus(job.id, 'fetching_commits')
  await emitEvent(job.id, 'stage_started', { stage: 'fetch', source: job.sourceType })

  const octokit = createOctokit(accessToken)
  const { owner, repo } = parseRepoUrl(repoUrl)

  let raw: RawCommit[]

  if (job.sourceType === 'pr' && job.sourceRef) {
    // Either a full GitHub URL or owner/repo#N shorthand. parsePrUrl handles both.
    const pr = parsePrUrl(job.sourceRef)
    // Sanity-check that the PR is on the same repo the job is bound to.
    if (pr.owner !== owner || pr.repo !== repo) {
      throw new Error(`PR ${job.sourceRef} doesn't belong to ${owner}/${repo}.`)
    }
    const result = await fetchPrCommits(octokit, owner, repo, pr.number)
    raw = result.commits
    await emitEvent(job.id, 'stage_started', {
      stage: 'fetch_pr',
      prNumber: pr.number,
      prTitle: result.pr.title,
    })
  } else if (job.sourceType === 'release' && job.sourceRef) {
    const result = await fetchCommitsForTag(octokit, owner, repo, job.sourceRef)
    raw = result.commits
    await emitEvent(job.id, 'stage_started', {
      stage: 'fetch_release',
      tag: job.sourceRef,
      previousTag: result.previousTag,
    })
  } else {
    raw = await fetchCommits(octokit, owner, repo, job.windowStart, job.windowEnd)
  }

  const { commits: filtered } = filterCommits(raw)
  const sanitized = sanitizeCommits(filtered)

  await persistCommitSnapshots(job.id, sanitized)
  await emitEvent(job.id, 'stage_completed', { stage: 'fetch', count: sanitized.length })

  return sanitized
}
