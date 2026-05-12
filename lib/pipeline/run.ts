import { updateJobStatus, incrementRetry } from '@/lib/db/queries/jobs'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { emitEvent } from '@/lib/db/queries/events'
import { notifyJobComplete } from './notify'
import { stageFetch } from './stages/fetch'
import { stageSummarize } from './stages/summarize'
import { stageNarrative } from './stages/narrative'
import { stageGenerate } from './stages/generate'
import type { GenerationJob, VoiceSettings } from '@/types/jobs'

const MAX_RETRIES = 3

async function withRetry<T>(
  jobId: string,
  stageName: string,
  fn: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (attempt >= MAX_RETRIES - 1) throw err
    await incrementRetry(jobId)
    await emitEvent(jobId, 'stage_retrying', { stage: stageName, attempt: attempt + 1, error: String(err) })
    const delay = 1000 * 2 ** attempt
    await new Promise(r => setTimeout(r, delay))
    return withRetry(jobId, stageName, fn, attempt + 1)
  }
}

export async function runPipeline(
  job: GenerationJob,
  repoUrl: string,
  accessToken: string,
): Promise<void> {
  try {
    const voice = await getVoiceSettings(job.userId) ?? {
      tone: 'professional',
      technicalLevel: 7,
      audience: 'developers',
    }

    const commits = await withRetry(job.id, 'fetch', () =>
      stageFetch(job, repoUrl, accessToken)
    )

    if (commits.length === 0) {
      await updateJobStatus(job.id, 'completed')
      await emitEvent(job.id, 'completed', { reason: 'no_commits' })
      await notifyJobComplete(job.id)
      return
    }

    const summaries = await withRetry(job.id, 'summarize', () =>
      stageSummarize(job, commits)
    )

    const narrative = await withRetry(job.id, 'narrative', () =>
      stageNarrative(job, summaries, voice as VoiceSettings)
    )

    const { partial } = await withRetry(job.id, 'generate', () =>
      stageGenerate(job, narrative, voice as VoiceSettings)
    )

    const finalStatus = partial ? 'partial_completed' : 'completed'
    await updateJobStatus(job.id, finalStatus)
    await emitEvent(job.id, 'completed', { status: finalStatus })
    await notifyJobComplete(job.id)
  } catch (err) {
    await updateJobStatus(job.id, 'failed')
    await emitEvent(job.id, 'failed', { error: String(err) })
    throw err
  }
}
