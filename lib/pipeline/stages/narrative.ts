import { extractNarrative } from '@/lib/ai/narrative'
import { persistNarrative } from '@/lib/db/queries/narratives'
import { persistAILog } from '@/lib/db/queries/logs'
import { emitEvent } from '@/lib/db/queries/events'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import type { GenerationJob, VoiceSettings } from '@/types/jobs'
import type { CommitSummary, Narrative } from '@/types/ai'

export async function stageNarrative(job: GenerationJob, summaries: CommitSummary[], voice: VoiceSettings): Promise<Narrative> {
  await updateJobStatus(job.id, 'extracting_narrative')
  await emitEvent(job.id, 'stage_started', { stage: 'narrative' })

  const { narrative, _meta } = await extractNarrative(summaries, voice)

  await persistAILog({
    jobId: job.id,
    stage: 'narrative',
    promptTokens: _meta.promptTokens,
    completionTokens: _meta.completionTokens,
    promptVersion: _meta.promptVersion,
  })

  await persistNarrative(job.id, narrative)

  await emitEvent(job.id, 'stage_completed', { stage: 'narrative' })

  return narrative
}
