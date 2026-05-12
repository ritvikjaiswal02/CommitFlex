import { summarizeCommits } from '@/lib/ai/summarize'
import { persistCommitSummary } from '@/lib/db/queries/summaries'
import { persistAILog } from '@/lib/db/queries/logs'
import { emitEvent } from '@/lib/db/queries/events'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import type { GenerationJob } from '@/types/jobs'
import type { RawCommit } from '@/types/github'
import type { CommitSummary } from '@/types/ai'

export async function stageSummarize(job: GenerationJob, commits: RawCommit[]): Promise<CommitSummary[]> {
  await updateJobStatus(job.id, 'summarizing')
  await emitEvent(job.id, 'stage_started', { stage: 'summarize' })

  const { summaries, _meta } = await summarizeCommits(commits)

  await persistAILog({
    jobId: job.id,
    stage: 'summarize',
    promptTokens: _meta.promptTokens,
    completionTokens: _meta.completionTokens,
    promptVersion: _meta.promptVersion,
  })

  for (const summary of summaries) {
    await persistCommitSummary(job.id, summary)
  }

  await emitEvent(job.id, 'stage_completed', { stage: 'summarize', count: summaries.length })

  return summaries
}
