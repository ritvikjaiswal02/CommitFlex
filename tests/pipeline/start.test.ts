import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('@/lib/ai/provider', () => ({ aiCircuitBreaker: { isOpen: vi.fn(() => false) } }))
vi.mock('@/lib/plans', () => ({
  reserveUsage: vi.fn(),
  refundUsage: vi.fn(),
  isPlanError: (err: any) => err?.name === 'PlanError',
}))
vi.mock('@/lib/db/queries/jobs', () => ({ createJobExclusive: vi.fn(), getActiveJob: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => ({ getRepo: vi.fn() }))
vi.mock('@/lib/db/queries/integrations', () => ({ getGithubAccessToken: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({ getAutopilotSettings: vi.fn() }))
vi.mock('@/lib/pipeline/run', () => ({ runPipeline: vi.fn(() => Promise.resolve()), runPrefetch: vi.fn(() => Promise.resolve()) }))

import { waitUntil } from '@vercel/functions'
import { aiCircuitBreaker } from '@/lib/ai/provider'
import { refundUsage, reserveUsage } from '@/lib/plans'
import { createJobExclusive, getActiveJob } from '@/lib/db/queries/jobs'
import { getRepo } from '@/lib/db/queries/repos'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { getAutopilotSettings } from '@/lib/db/queries/autopilot'
import { runPipeline, runPrefetch } from '@/lib/pipeline/run'
import { defaultAutoQueue, startGenerationJob, startJobErrorResponse } from '@/lib/pipeline/start'

const repo = { id: 'repo-1', userId: 'user-1', fullName: 'acme/widget', url: null, deletedAt: null }
const windowSource = { type: 'window' as const, windowStart: new Date('2026-10-01'), windowEnd: new Date('2026-10-08') }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getRepo).mockResolvedValue(repo as any)
  vi.mocked(getActiveJob).mockResolvedValue(null)
  vi.mocked(getGithubAccessToken).mockResolvedValue('gho_token')
  vi.mocked(reserveUsage).mockResolvedValue({ plan: { id: 'pro' }, count: 1, period: '2026-11' } as any)
  vi.mocked(getAutopilotSettings).mockResolvedValue({ defaultVoiceProfileId: 'voice-auto' } as any)
  vi.mocked(createJobExclusive).mockImplementation(async (p: any) => ({ ok: true, job: { id: 'job-1', ...p } }))
  vi.mocked(aiCircuitBreaker.isOpen).mockReturnValue(false)
})

describe('startGenerationJob', () => {
  it('reserves usage, creates the job and runs the pipeline in the background', async () => {
    const result = await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'manual' })
    expect(result).toEqual({ ok: true, jobId: 'job-1' })
    expect(createJobExclusive).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'manual', autoQueue: false, sourceType: 'window', sourceRef: null, voiceProfileId: null, awaitingInput: false,
    }))
    expect(reserveUsage).toHaveBeenCalledWith('user-1', 'generations', 1)
    expect(refundUsage).not.toHaveBeenCalled()
    expect(runPipeline).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }), 'https://github.com/acme/widget', 'gho_token')
    expect(waitUntil).toHaveBeenCalled()
  })

  it('auto-queues ship moments and uses the autopilot voice', async () => {
    await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: { type: 'pr', ref: 'https://github.com/acme/widget/pull/1' }, trigger: 'pr_merged' })
    expect(createJobExclusive).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'pr_merged', autoQueue: true, sourceType: 'pr', sourceRef: 'https://github.com/acme/widget/pull/1', voiceProfileId: 'voice-auto',
    }))
  })

  it('returns not_found for another user’s or a deleted repo', async () => {
    vi.mocked(getRepo).mockResolvedValue({ ...repo, userId: 'other' } as any)
    expect(await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'manual' })).toMatchObject({ ok: false, status: 404 })
    vi.mocked(getRepo).mockResolvedValue({ ...repo, deletedAt: new Date() } as any)
    expect(await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'manual' })).toMatchObject({ ok: false, status: 404 })
  })

  it('returns active_job with the running id', async () => {
    vi.mocked(getActiveJob).mockResolvedValue({ id: 'running' })
    expect(await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'manual' })).toMatchObject({
      ok: false, status: 409, code: 'active_job', jobId: 'running',
    })
  })

  it('returns no_github_token and circuit_open', async () => {
    vi.mocked(getGithubAccessToken).mockResolvedValueOnce(null)
    expect(await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'manual' })).toMatchObject({ status: 412 })
    vi.mocked(aiCircuitBreaker.isOpen).mockReturnValueOnce(true)
    expect(await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'manual' })).toMatchObject({ status: 503, code: 'circuit_open' })
    expect(createJobExclusive).not.toHaveBeenCalled()
  })

  it('loses a race for the repo gracefully: 409 with the winner, and the generation is refunded', async () => {
    vi.mocked(createJobExclusive).mockResolvedValueOnce({ ok: false, activeJobId: 'winner' })
    const result = await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'push' })
    expect(result).toMatchObject({ ok: false, status: 409, code: 'active_job', jobId: 'winner' })
    expect(refundUsage).toHaveBeenCalledWith('user-1', 1, 'generations', '2026-11')
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('runs only the prefetch half for onboarding prefetches', async () => {
    await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'onboarding', mode: 'prefetch' })
    expect(createJobExclusive).toHaveBeenCalledWith(expect.objectContaining({ awaitingInput: true }))
    expect(runPrefetch).toHaveBeenCalled()
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('returns limit_reached with the plan error body and creates nothing', async () => {
    const body = { error: 'limit', code: 'limit_reached', limit: 'generationsPerMonth', used: 10, max: 10, requiredPlan: 'pro', currentPlan: 'free' }
    vi.mocked(reserveUsage).mockRejectedValue(Object.assign(new Error('limit'), { name: 'PlanError', status: 402, body }))
    const result = await startGenerationJob({ userId: 'user-1', repoId: 'repo-1', source: windowSource, trigger: 'weekly_digest' })
    expect(result).toMatchObject({ ok: false, status: 402, code: 'limit_reached', planError: body })
    expect(createJobExclusive).not.toHaveBeenCalled()
    const res = startJobErrorResponse(result as any)
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual(body)
  })

  it('knows which triggers auto-queue', () => {
    expect(defaultAutoQueue('release_published')).toBe(true)
    expect(defaultAutoQueue('extension')).toBe(false)
    expect(defaultAutoQueue('manual')).toBe(false)
  })
})
