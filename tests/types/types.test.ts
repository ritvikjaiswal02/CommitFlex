import { describe, it, expect, expectTypeOf } from 'vitest'
import type { RawCommit, FilteredCommits, GithubRepo } from '@/types/github'
import type { CommitSummary, Narrative, GeneratedPost } from '@/types/ai'
import type { PostDraft, PostPlatform, PostStatus } from '@/types/posts'
import type { GenerationJob, GenerationJobStatus, PipelineEventType } from '@/types/jobs'

describe('types', () => {
  it('RawCommit has required fields', () => {
    const commit: RawCommit = {
      sha: 'abc123',
      message: 'feat: add auth',
      author: 'Dev',
      date: '2026-01-01T00:00:00Z',
      url: 'https://github.com/a/b/commit/abc123',
    }
    expectTypeOf(commit).toMatchTypeOf<RawCommit>()
  })

  it('GenerationJobStatus includes all pipeline statuses', () => {
    const status: GenerationJobStatus = 'extracting_narrative'
    expectTypeOf(status).toMatchTypeOf<GenerationJobStatus>()
  })
})

describe('autopilot types', () => {
  it('lists every queue status and job trigger', async () => {
    const { QUEUE_STATUSES, JOB_TRIGGERS, ACTIVE_QUEUE_STATUSES } = await import('@/types/autopilot')
    expect(QUEUE_STATUSES).toHaveLength(8)
    expect(JOB_TRIGGERS).toContain('release_published')
    expect(ACTIVE_QUEUE_STATUSES).toEqual(['pending_review', 'approved', 'scheduled', 'ready'])
  })
})
