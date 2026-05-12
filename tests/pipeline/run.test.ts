import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/queries/jobs', () => ({
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
  incrementRetry: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/db/queries/voice', () => ({
  getVoiceSettings: vi.fn().mockResolvedValue({ tone: 'professional', technicalLevel: 7, audience: 'developers' }),
}))
vi.mock('@/lib/db/queries/events', () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/pipeline/stages/fetch', () => ({
  stageFetch: vi.fn(),
}))
vi.mock('@/lib/pipeline/stages/summarize', () => ({
  stageSummarize: vi.fn(),
}))
vi.mock('@/lib/pipeline/stages/narrative', () => ({
  stageNarrative: vi.fn(),
}))
vi.mock('@/lib/pipeline/stages/generate', () => ({
  stageGenerate: vi.fn(),
}))

import { stageFetch } from '@/lib/pipeline/stages/fetch'
import { stageSummarize } from '@/lib/pipeline/stages/summarize'
import { stageNarrative } from '@/lib/pipeline/stages/narrative'
import { stageGenerate } from '@/lib/pipeline/stages/generate'
import { updateJobStatus, incrementRetry } from '@/lib/db/queries/jobs'
import { emitEvent } from '@/lib/db/queries/events'

const job = {
  id: 'job-1', userId: 'user-1', repoId: 'repo-1',
  windowStart: new Date('2026-01-01'), windowEnd: new Date('2026-01-08'),
  status: 'queued', retryCount: 0, createdAt: new Date(), updatedAt: new Date(),
}

const commits = [{ sha: 'a', message: 'feat: thing', author: 'Alice', date: '2026-01-01T00:00:00Z', url: 'https://github.com/a/b/commit/a' }]
const summaries = [{ sha: 'a', summary: 'Added a thing', tags: ['feature'], significance: 7 }]
const narrative = { theme: 'Growth', story: 'Built things.', keyPoints: ['point'], technicalDepth: 7 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(stageFetch).mockResolvedValue(commits as any)
  vi.mocked(stageSummarize).mockResolvedValue(summaries as any)
  vi.mocked(stageNarrative).mockResolvedValue(narrative as any)
  vi.mocked(stageGenerate).mockResolvedValue({ linkedinDraftId: 'd1', twitterDraftId: 'd2', partial: false, errors: {} })
})

describe('runPipeline', () => {
  it('runs all 4 stages and marks job completed', async () => {
    const { runPipeline } = await import('@/lib/pipeline/run')
    await runPipeline(job as any, 'https://github.com/a/b', 'enc-token')

    expect(stageFetch).toHaveBeenCalledOnce()
    expect(stageSummarize).toHaveBeenCalledOnce()
    expect(stageNarrative).toHaveBeenCalledOnce()
    expect(stageGenerate).toHaveBeenCalledOnce()
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'completed')
  })

  it('marks partial_completed when generate is partial', async () => {
    vi.mocked(stageGenerate).mockResolvedValue({ linkedinDraftId: 'd1', twitterDraftId: null, partial: true, errors: { twitter: 'failed' } })
    const { runPipeline } = await import('@/lib/pipeline/run')
    await runPipeline(job as any, 'https://github.com/a/b', 'enc-token')
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'partial_completed')
  })

  it('completes with no_commits when fetch returns empty', async () => {
    vi.mocked(stageFetch).mockResolvedValue([])
    const { runPipeline } = await import('@/lib/pipeline/run')
    await runPipeline(job as any, 'https://github.com/a/b', 'enc-token')
    expect(stageSummarize).not.toHaveBeenCalled()
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'completed')
    expect(emitEvent).toHaveBeenCalledWith('job-1', 'completed', { reason: 'no_commits' })
  })

  it('marks job failed on unrecoverable error', async () => {
    vi.mocked(stageFetch).mockRejectedValue(new Error('Network error'))
    const { runPipeline } = await import('@/lib/pipeline/run')
    await expect(runPipeline(job as any, 'https://github.com/a/b', 'enc-token')).rejects.toThrow('Network error')
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'failed')
  })

  it('retries on transient failure then succeeds', async () => {
    vi.mocked(stageFetch)
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(commits as any)
    vi.useFakeTimers()

    const { runPipeline } = await import('@/lib/pipeline/run')
    const pipelinePromise = runPipeline(job as any, 'https://github.com/a/b', 'enc-token')
    await vi.runAllTimersAsync()
    await pipelinePromise

    expect(incrementRetry).toHaveBeenCalledOnce()
    expect(stageFetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
