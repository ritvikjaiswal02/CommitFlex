import { createOctokit } from '@/lib/github/client'
import { fetchCommits, parseRepoUrl } from '@/lib/github/commits'
import { fetchPrCommits, parsePrUrl } from '@/lib/github/pr'
import { fetchCommitsForTag, fetchReleaseNotes } from '@/lib/github/release'
import { filterCommits } from '@/lib/github/filter'
import { sanitizeCommitMessage, sanitizeCommits } from '@/lib/github/sanitize'
import { persistCommitSnapshots } from '@/lib/db/queries/snapshots'
import { emitEvent } from '@/lib/db/queries/events'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import type { GenerationJob } from '@/types/jobs'
import type { RawCommit } from '@/types/github'

export interface FetchStageResult {
  commits: RawCommit[]
  /** PR description or release notes, sanitised and trimmed. Null for window jobs. */
  sourceContext: string | null
  /** Commits before filtering. */
  rawCount: number
}

const MAX_CONTEXT_CHARS = 2500

/** Trims a PR body or release notes for the prompt: drops HTML comments and checklists noise. */
export function cleanSourceText(text: string | null | undefined): string {
  if (!text) return ''
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*- \[[ xX]\] .*$/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const safe = sanitizeCommitMessage(cleaned)
  return safe.length > MAX_CONTEXT_CHARS ? `${safe.slice(0, MAX_CONTEXT_CHARS)}…` : safe
}

export async function stageFetch(job: GenerationJob, repoUrl: string, accessToken: string): Promise<FetchStageResult> {
  await updateJobStatus(job.id, 'fetching_commits')
  await emitEvent(job.id, 'stage_started', { stage: 'fetch', source: job.sourceType })

  const octokit = createOctokit(accessToken)
  const { owner, repo } = parseRepoUrl(repoUrl)

  let raw: RawCommit[]
  let sourceContext: string | null = null

  if (job.sourceType === 'pr' && job.sourceRef) {
    // Either a full GitHub URL or owner/repo#N shorthand. parsePrUrl handles both.
    const pr = parsePrUrl(job.sourceRef)
    if (pr.owner.toLowerCase() !== owner.toLowerCase() || pr.repo.toLowerCase() !== repo.toLowerCase()) {
      throw new Error(`PR ${job.sourceRef} doesn't belong to ${owner}/${repo}.`)
    }
    const result = await fetchPrCommits(octokit, owner, repo, pr.number)
    raw = result.commits
    const body = cleanSourceText(result.pr.body)
    sourceContext = `Pull request #${result.pr.number}: ${result.pr.title}${body ? `\n\n${body}` : ''}`
    await emitEvent(job.id, 'stage_started', {
      stage: 'fetch_pr',
      prNumber: pr.number,
      prTitle: result.pr.title,
    })
  } else if (job.sourceType === 'release' && job.sourceRef) {
    const [result, notes] = await Promise.all([
      fetchCommitsForTag(octokit, owner, repo, job.sourceRef),
      fetchReleaseNotes(octokit, owner, repo, job.sourceRef),
    ])
    raw = result.commits
    const body = cleanSourceText(notes?.body)
    const title = notes?.name && notes.name !== job.sourceRef ? `${job.sourceRef} (${notes.name})` : job.sourceRef
    sourceContext = `Release ${title}${result.previousTag ? `, the first release since ${result.previousTag}` : ''}.${body ? `\n\nRelease notes:\n${body}` : ''}`
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
  await updateJobStatus(job.id, 'fetching_commits', { commitCount: raw.length, filteredCount: sanitized.length })
  await emitEvent(job.id, 'stage_completed', { stage: 'fetch', count: sanitized.length, raw: raw.length })

  return { commits: sanitized, sourceContext, rawCount: raw.length }
}
