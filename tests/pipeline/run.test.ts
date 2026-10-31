import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/queries/jobs', () => ({
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
  incrementRetry: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/db/queries/voice', () => ({
  getVoiceSettings: vi.fn().mockResolvedValue({ tone: 'professional', technicalLevel: 7, audience: 'developers' }),
  getVoiceProfile: vi.fn(),
}))
vi.mock('@/lib/db/queries/onboarding', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ role: 'founder' }),
  buildAuthorContext: vi.fn().mockReturnValue('Author: indie founder.'),
}))
vi.mock('@/lib/db/queries/events', () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/autopilot/queue', () => ({ enqueueJobDrafts: vi.fn().mockResolvedValue({ queued: 2 }) }))
vi.mock('@/lib/pipeline/notify', () => ({ notifyJobComplete: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pipeline/stages/fetch', () => ({ stageFetch: vi.fn() }))
vi.mock('@/lib/pipeline/stages/summarize', () => ({ stageSummarize: vi.fn() }))
vi.mock('@/lib/pipeline/stages/narrative', () => ({ stageNarrative: vi.fn() }))
vi.mock('@/lib/pipeline/stages/generate', () => ({ stageGenerate: vi.fn() }))

import { stageFetch } from '@/lib/pipeline/stages/fetch'
import { stageSummarize } from '@/lib/pipeline/stages/summarize'
import { stageNarrative } from '@/lib/pipeline/stages/narrative'
import { stageGenerate } from '@/lib/pipeline/stages/generate'
import { updateJobStatus, incrementRetry } from '@/lib/db/queries/jobs'
import { getVoiceProfile } from '@/lib/db/queries/voice'
import { emitEvent } from '@/lib/db/queries/events'
import { enqueueJobDrafts } from '@/lib/autopilot/queue'
import { notifyJobComplete } from '@/lib/pipeline/notify'
import { runPipeline } from '@/lib/pipeline/run'

const job = {
  id: 'job-1', userId: 'user-1', repoId: 'repo-1',
  windowStart: new Date('2026-01-01'), windowEnd: new Date('2026-01-08'),
  status: 'queued', retryCount: 0, commitCount: 0, filteredCount: 0, sourceType: 'window',
  createdAt: new Date(), updatedAt: new Date(),
}

const commits = [{ sha: 'a', message: 'feat: thing', author: 'Alice', date: '2026-01-01T00:00:00Z', url: 'https://github.com/a/b/commit/a' }]
const summaries = [{ sha: 'a', summary: 'Added a thing', tags: ['feature'], significance: 7 }]
const narrative = { theme: 'Growth', story: 'Built things.', keyPoints: ['point'], technicalDepth: 7 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(stageFetch).mockResolvedValue({ commits, sourceContext: 'Pull request #4: Add retries', rawCount: 1 } as any)
  vi.mocked(stageSummarize).mockResolvedValue(summaries as any)
  vi.mocked(stageNarrative).mockResolvedValue(narrative as any)
  vi.mocked(stageGenerate).mockResolvedValue({ linkedinDraftId: 'd1', twitterDraftId: 'd2', partial: false, errors: {} })
})

describe('runPipeline', () => {
  it('runs all 4 stages and marks job completed', async () => {
    await runPipeline(job as any, 'https://github.com/a/b', 'token')
    expect(stageFetch).toHaveBeenCalledOnce()
    expect(stageSummarize).toHaveBeenCalledOnce()
    expect(stageNarrative).toHaveBeenCalledOnce()
    expect(stageGenerate).toHaveBeenCalledOnce()
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'completed', expect.objectContaining({ completedAt: expect.any(Date) }))
    expect(notifyJobComplete).toHaveBeenCalledWith('job-1')
  })

  it('passes author and source context to the narrative and posts', async () => {
    await runPipeline(job as any, 'https://github.com/a/b', 'token')
    expect(stageNarrative).toHaveBeenCalledWith(
      expect.anything(),
      summaries,
      expect.objectContaining({ tone: 'professional' }),
      { authorContext: 'Author: indie founder.', sourceContext: 'Pull request #4: Add retries' },
    )
    expect(stageGenerate).toHaveBeenCalledWith(expect.anything(), narrative, expect.anything(), {
      authorContext: 'Author: indie founder.',
    })
  })

  it("uses the job's voice profile when it belongs to the user", async () => {
    vi.mocked(getVoiceProfile).mockResolvedValue({
      id: 'v1', userId: 'user-1', tone: 'casual', technicalLevel: 4, audience: 'founders', extraContext: 'Voice fingerprint: short.',
    } as any)
    await runPipeline({ ...job, voiceProfileId: 'v1' } as any, 'https://github.com/a/b', 'token')
    expect(stageNarrative).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ tone: 'casual', extraContext: 'Voice fingerprint: short.' }),
      expect.anything(),
    )
  })

  it("ignores another user's voice profile", async () => {
    vi.mocked(getVoiceProfile).mockResolvedValue({ id: 'v1', userId: 'intruder', tone: 'casual' } as any)
    await runPipeline({ ...job, voiceProfileId: 'v1' } as any, 'https://github.com/a/b', 'token')
    expect(stageNarrative).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ tone: 'professional' }),
      expect.anything(),
    )
  })

  it('queues drafts for autoQueue jobs only', async () => {
    await runPipeline(job as any, 'https://github.com/a/b', 'token')
    expect(enqueueJobDrafts).not.toHaveBeenCalled()
    await runPipeline({ ...job, autoQueue: true } as any, 'https://github.com/a/b', 'token')
    expect(enqueueJobDrafts).toHaveBeenCalledWith('job-1')
  })

  it('does not fail the job when queueing fails', async () => {
    vi.mocked(enqueueJobDrafts).mockRejectedValueOnce(new Error('db down'))
    await runPipeline({ ...job, autoQueue: true } as any, 'https://github.com/a/b', 'token')
    expect(updateJobStatus).not.toHaveBeenCalledWith('job-1', 'failed', expect.anything())
  })

  it('marks partial_completed when generate is partial', async () => {
    vi.mocked(stageGenerate).mockResolvedValue({ linkedinDraftId: 'd1', twitterDraftId: null, partial: true, errors: { twitter: 'failed' } })
    await runPipeline(job as any, 'https://github.com/a/b', 'token')
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'partial_completed', expect.anything())
  })

  it('completes with no_commits when fetch returns empty', async () => {
    vi.mocked(stageFetch).mockResolvedValue({ commits: [], sourceContext: null, rawCount: 0 })
    await runPipeline(job as any, 'https://github.com/a/b', 'token')
    expect(stageSummarize).not.toHaveBeenCalled()
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'completed', expect.anything())
    expect(emitEvent).toHaveBeenCalledWith('job-1', 'completed', { reason: 'no_commits' })
  })

  it('marks job failed with the error message on unrecoverable error', async () => {
    vi.useFakeTimers()
    vi.mocked(stageFetch).mockRejectedValue(new Error('Network error'))
    const promise = runPipeline(job as any, 'https://github.com/a/b', 'token')
    const assertion = expect(promise).rejects.toThrow('Network error')
    await vi.runAllTimersAsync()
    await assertion
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'failed', expect.objectContaining({ errorMessage: 'Network error' }))
    vi.useRealTimers()
  })

  it('retries on transient failure then succeeds', async () => {
    vi.mocked(stageFetch)
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ commits, sourceContext: null, rawCount: 1 })
    vi.useFakeTimers()
    const promise = runPipeline(job as any, 'https://github.com/a/b', 'token')
    await vi.runAllTimersAsync()
    await promise
    expect(incrementRetry).toHaveBeenCalledOnce()
    expect(stageFetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
