import { describe, it, expectTypeOf } from 'vitest'
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
