/**
 * The single entry point for starting a generation job, used by the generate
 * route, webhooks, the autopilot cron, onboarding and the extension.
 *
 * Checks (in order): repo ownership, an already-running job, the GitHub token,
 * the AI circuit, and the monthly generation limit. Then creates the job,
 * records usage and runs the pipeline under `waitUntil` so serverless
 * functions finish the work after responding. Never throws for expected cases.
 */
import { waitUntil } from '@vercel/functions'
import { aiCircuitBreaker } from '@/lib/ai/provider'
import { isPlanError, refundUsage, reserveUsage } from '@/lib/plans'
import type { PlanErrorBody } from '@/lib/plans'
import { createJobExclusive, getActiveJob } from '@/lib/db/queries/jobs'
import { getRepo } from '@/lib/db/queries/repos'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { getAutopilotSettings } from '@/lib/db/queries/autopilot'
import type { JobTrigger } from '@/types/autopilot'
import type { GenerationJob } from '@/types/jobs'
import { runPipeline, runPrefetch } from './run'

export interface StartJobInput {
  userId: string
  repoId: string
  source:
    | { type: 'window'; windowStart: Date; windowEnd: Date }
    | { type: 'pr'; ref: string }
    | { type: 'release'; ref: string }
  trigger: JobTrigger
  voiceProfileId?: string | null
  /** Default: true for pr_merged|release_published|weekly_digest|cadence|onboarding|push. */
  autoQueue?: boolean
  /**
   * 'prefetch' (onboarding only): fetch and summarise now, park the job and
   * write the posts once /api/onboarding/complete has the answers.
   */
  mode?: 'full' | 'prefetch'
}

export type StartJobResult =
  | { ok: true; jobId: string }
  | {
      ok: false
      status: 402 | 404 | 409 | 412 | 503
      code: 'limit_reached' | 'not_found' | 'active_job' | 'no_github_token' | 'circuit_open'
      error: string
      jobId?: string
      planError?: PlanErrorBody
    }

const AUTO_QUEUE_TRIGGERS: ReadonlySet<JobTrigger> = new Set<JobTrigger>([
  'pr_merged',
  'release_published',
  'weekly_digest',
  'cadence',
  'onboarding',
  'push',
])

/** Autopilot-started jobs write with the autopilot's default voice profile. */
const AUTOPILOT_TRIGGERS: ReadonlySet<JobTrigger> = new Set<JobTrigger>([
  'pr_merged',
  'release_published',
  'weekly_digest',
  'cadence',
  'push',
  'onboarding',
])

export function defaultAutoQueue(trigger: JobTrigger): boolean {
  return AUTO_QUEUE_TRIGGERS.has(trigger)
}

function windowFor(source: StartJobInput['source'], now: Date): { windowStart: Date; windowEnd: Date } {
  if (source.type === 'window') return { windowStart: source.windowStart, windowEnd: source.windowEnd }
  // PR and release jobs read commits from the PR or tag; the window is metadata.
  const yearAgo = new Date(now)
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1)
  return { windowStart: yearAgo, windowEnd: now }
}

/** Runs a promise after the response when the platform supports it. */
export function runInBackground(promise: Promise<unknown>): void {
  const guarded = promise.catch((err) => console.error('[pipeline] background run failed', err))
  try {
    waitUntil(guarded)
  } catch {
    // Outside a Vercel request context the promise simply keeps running.
  }
}

export async function startGenerationJob(input: StartJobInput): Promise<StartJobResult> {
  const repo = await getRepo(input.repoId)
  if (!repo || repo.userId !== input.userId || repo.deletedAt) {
    return { ok: false, status: 404, code: 'not_found', error: 'That repository is not connected to your account.' }
  }

  const active = await getActiveJob(repo.id)
  if (active) {
    return {
      ok: false,
      status: 409,
      code: 'active_job',
      error: `Drafts for ${repo.fullName} are already being written. Wait for that run to finish.`,
      jobId: active.id,
    }
  }

  const accessToken = await getGithubAccessToken(input.userId)
  if (!accessToken) {
    return {
      ok: false,
      status: 412,
      code: 'no_github_token',
      error: 'Your GitHub connection is missing. Sign out and sign in with GitHub again.',
    }
  }

  if (aiCircuitBreaker.isOpen()) {
    return {
      ok: false,
      status: 503,
      code: 'circuit_open',
      error: 'The writing model is having trouble right now. Try again in a couple of minutes.',
    }
  }

  // Reserve the generation atomically before any expensive work, so
  // concurrent webhooks, cron runs and clicks can't all slip under the limit.
  let period: string
  try {
    period = (await reserveUsage(input.userId, 'generations', 1)).period
  } catch (err) {
    if (isPlanError(err)) {
      return { ok: false, status: 402, code: 'limit_reached', error: err.body.error, planError: err.body }
    }
    throw err
  }

  let voiceProfileId = input.voiceProfileId ?? null
  if (!voiceProfileId && AUTOPILOT_TRIGGERS.has(input.trigger)) {
    try {
      voiceProfileId = (await getAutopilotSettings(input.userId)).defaultVoiceProfileId
    } catch {
      voiceProfileId = null
    }
  }

  const now = new Date()
  const { windowStart, windowEnd } = windowFor(input.source, now)
  const prefetch = input.mode === 'prefetch'
  let created: Awaited<ReturnType<typeof createJobExclusive>>
  try {
    created = await createJobExclusive({
      userId: input.userId,
      repoId: repo.id,
      windowStart,
      windowEnd,
      sourceType: input.source.type,
      sourceRef: input.source.type === 'window' ? null : input.source.ref,
      trigger: input.trigger,
      voiceProfileId,
      autoQueue: input.autoQueue ?? defaultAutoQueue(input.trigger),
      awaitingInput: prefetch,
    })
  } catch (err) {
    await refundUsage(input.userId, 1, 'generations', period)
    throw err
  }

  if (!created.ok) {
    // Lost the race to another start for this repo: give the generation back.
    await refundUsage(input.userId, 1, 'generations', period)
    return {
      ok: false,
      status: 409,
      code: 'active_job',
      error: `Drafts for ${repo.fullName} are already being written. Wait for that run to finish.`,
      ...(created.activeJobId ? { jobId: created.activeJobId } : {}),
    }
  }
  const job = created.job

  const repoUrl = repo.url ?? `https://github.com/${repo.fullName}`
  runInBackground(
    prefetch
      ? runPrefetch(job as GenerationJob, repoUrl, accessToken)
      : runPipeline(job as GenerationJob, repoUrl, accessToken),
  )

  return { ok: true, jobId: job.id }
}

/** StartJobResult failure → API response in the shared error shape. */
export function startJobErrorResponse(result: Extract<StartJobResult, { ok: false }>): Response {
  if (result.status === 402 && result.planError) return Response.json(result.planError, { status: 402 })
  return Response.json(
    { error: result.error, code: result.code, ...(result.jobId ? { jobId: result.jobId } : {}) },
    { status: result.status },
  )
}
