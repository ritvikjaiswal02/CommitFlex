import { updateJobStatus, incrementRetry, savePrefetch, claimPrefetchedJob } from '@/lib/db/queries/jobs'
import { getVoiceProfile, getVoiceSettings } from '@/lib/db/queries/voice'
import { getUserProfile, buildAuthorContext } from '@/lib/db/queries/onboarding'
import { emitEvent } from '@/lib/db/queries/events'
import { enqueueJobDrafts } from '@/lib/autopilot/queue'
import { currentPeriod, refundUsage } from '@/lib/plans'
import { notifyJobComplete } from './notify'
import { stageFetch } from './stages/fetch'
import { stageSummarize } from './stages/summarize'
import { stageNarrative } from './stages/narrative'
import { stageGenerate } from './stages/generate'
import type { GenerationJob, VoiceSettings } from '@/types/jobs'
import type { CommitSummary } from '@/types/ai'

const MAX_RETRIES = 3

const DEFAULT_VOICE: VoiceSettings = {
  tone: 'professional',
  technicalLevel: 7,
  audience: 'developers',
}

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

/** The job's chosen voice profile (if it still belongs to the user), else the default. */
async function resolveVoice(job: GenerationJob): Promise<VoiceSettings> {
  if (job.voiceProfileId) {
    try {
      const profile = await getVoiceProfile(job.voiceProfileId)
      if (profile && profile.userId === job.userId) {
        return {
          tone: profile.tone,
          technicalLevel: profile.technicalLevel,
          audience: profile.audience,
          extraContext: profile.extraContext ?? undefined,
        }
      }
    } catch {
      // Fall through to the default profile.
    }
  }
  return (await getVoiceSettings(job.userId)) ?? DEFAULT_VOICE
}

async function resolveAuthorContext(userId: string): Promise<string | null> {
  try {
    const context = buildAuthorContext(await getUserProfile(userId))
    return context.trim() || null
  } catch {
    return null
  }
}

/** Queues drafts for autopilot jobs. Never fails the job. */
async function queueIfAuto(job: GenerationJob): Promise<void> {
  if (!job.autoQueue) return
  try {
    await enqueueJobDrafts(job.id)
  } catch (err) {
    console.error('[pipeline] failed to queue drafts', err)
    await emitEvent(job.id, 'queued_drafts', { queued: 0, error: String(err) }).catch(() => {})
  }
}

async function failJob(job: GenerationJob, started: number, err: unknown): Promise<void> {
  const jobId = job.id
  // A run that wrote nothing shouldn't count against the monthly limit.
  await refundUsage(job.userId, 1, 'generations', currentPeriod(new Date(job.createdAt)))
  await updateJobStatus(jobId, 'failed', {
    errorMessage: err instanceof Error ? err.message.slice(0, 1000) : String(err),
    completedAt: new Date(),
    totalDurationMs: Date.now() - started,
  })
  await emitEvent(jobId, 'failed', { error: String(err) })
}

async function completeWithoutCommits(jobId: string, started: number): Promise<void> {
  await updateJobStatus(jobId, 'completed', { completedAt: new Date(), totalDurationMs: Date.now() - started })
  await emitEvent(jobId, 'completed', { reason: 'no_commits' })
  await notifyJobComplete(jobId)
}

/** Narrative and posts from summaries, then queue and finish. Shared by full runs and prefetch resumes. */
async function writeFromSummaries(
  job: GenerationJob,
  summaries: CommitSummary[],
  sourceContext: string | null,
  started: number,
): Promise<void> {
  const [voice, authorContext] = await Promise.all([resolveVoice(job), resolveAuthorContext(job.userId)])

  const narrative = await withRetry(job.id, 'narrative', () =>
    stageNarrative(job, summaries, voice, { authorContext, sourceContext })
  )

  const { partial } = await withRetry(job.id, 'generate', () =>
    stageGenerate(job, narrative, voice, { authorContext })
  )

  // Queue before flipping the status, so anyone watching the job (SSE,
  // onboarding) sees the queue items as soon as it reads "completed".
  await queueIfAuto(job)
  const finalStatus = partial ? 'partial_completed' : 'completed'
  await updateJobStatus(job.id, finalStatus, { completedAt: new Date(), totalDurationMs: Date.now() - started })
  await emitEvent(job.id, 'completed', { status: finalStatus })
  await notifyJobComplete(job.id)
}

export async function runPipeline(
  job: GenerationJob,
  repoUrl: string,
  accessToken: string,
): Promise<void> {
  const started = Date.now()
  try {
    const { commits, sourceContext } = await withRetry(job.id, 'fetch', () =>
      stageFetch(job, repoUrl, accessToken)
    )

    if (commits.length === 0) {
      await completeWithoutCommits(job.id, started)
      return
    }

    const summaries = await withRetry(job.id, 'summarize', () =>
      stageSummarize(job, commits)
    )

    await writeFromSummaries(job, summaries, sourceContext, started)
  } catch (err) {
    await failJob(job, started, err)
    throw err
  }
}

/**
 * Onboarding prefetch: the slow, answer-independent half of the pipeline
 * (fetch and summarise) runs while the user is still answering questions.
 * The result is parked on the job ('prefetched'). If the answers already
 * arrived, this run carries straight on to writing.
 */
export async function runPrefetch(job: GenerationJob, repoUrl: string, accessToken: string): Promise<void> {
  const started = Date.now()
  try {
    const { commits, sourceContext } = await withRetry(job.id, 'fetch', () =>
      stageFetch(job, repoUrl, accessToken)
    )
    const summaries = commits.length === 0 ? [] : await withRetry(job.id, 'summarize', () => stageSummarize(job, commits))
    await savePrefetch(
      job.id,
      { summaries, sourceContext, commitCount: commits.length, finishedAt: new Date().toISOString() },
      commits.length,
    )
    await emitEvent(job.id, 'stage_completed', { stage: 'prefetch', count: summaries.length })
  } catch (err) {
    await failJob(job, started, err)
    throw err
  }
  // The user may have finished onboarding while we were summarising.
  await continuePrefetchedJob(job.id)
}

/**
 * Writes the posts for a parked onboarding job, if this caller wins the
 * claim. Safe to call from both the prefetch run and /complete.
 * Returns true when this call did (or attempted) the writing.
 */
export async function continuePrefetchedJob(jobId: string): Promise<boolean> {
  const claimed = await claimPrefetchedJob(jobId)
  if (!claimed) return false
  const started = Date.now()
  const job = claimed as unknown as GenerationJob
  const prefetch = claimed.prefetch
  try {
    if (!prefetch || prefetch.summaries.length === 0) {
      await completeWithoutCommits(job.id, started)
      return true
    }
    await writeFromSummaries(job, prefetch.summaries, prefetch.sourceContext, started)
  } catch (err) {
    await failJob(job, started, err)
    console.error('[pipeline] prefetched job failed', err)
  }
  return true
}
