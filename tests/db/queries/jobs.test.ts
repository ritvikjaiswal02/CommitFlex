import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'job-1', status: 'queued', retryCount: 0 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'job-1', status: 'queued', retryCount: 0 }]),
  }
}))

describe('createJob', () => {
  it('returns the created job', async () => {
    const { createJob } = await import('@/lib/db/queries/jobs')
    const job = await createJob({
      userId: 'user-1',
      repoId: 'repo-1',
      windowStart: new Date('2026-01-01'),
      windowEnd: new Date('2026-01-08'),
    })
    expect(job.id).toBe('job-1')
    expect(job.status).toBe('queued')
  })
})
