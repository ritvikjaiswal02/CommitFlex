import { createOctokit } from '@/lib/github/client'
import { fetchCommits, parseRepoUrl } from '@/lib/github/commits'
import { filterCommits } from '@/lib/github/filter'
import { sanitizeCommits } from '@/lib/github/sanitize'
import { persistCommitSnapshots } from '@/lib/db/queries/snapshots'
import { emitEvent } from '@/lib/db/queries/events'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import type { GenerationJob } from '@/types/jobs'
import type { RawCommit } from '@/types/github'

export async function stageFetch(job: GenerationJob, repoUrl: string, accessToken: string): Promise<RawCommit[]> {
  await updateJobStatus(job.id, 'fetching_commits')
  await emitEvent(job.id, 'stage_started', { stage: 'fetch' })

  const octokit = createOctokit(accessToken)
  const { owner, repo } = parseRepoUrl(repoUrl)

  const raw = await fetchCommits(octokit, owner, repo, job.windowStart, job.windowEnd)
  const { commits: filtered } = filterCommits(raw)
  const sanitized = sanitizeCommits(filtered)

  await persistCommitSnapshots(job.id, sanitized)
  await emitEvent(job.id, 'stage_completed', { stage: 'fetch', count: sanitized.length })

  return sanitized
}
