import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { getDraftsByJob } from '@/lib/db/queries/drafts'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import { requireJobOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { GET, DELETE } from '@/app/api/jobs/[jobId]/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/drafts', () => ({
  getDraftsByJob: vi.fn(),
  updateDraftContent: vi.fn(),
  markDraftCopied: vi.fn(),
  getDraft: vi.fn(),
}))
vi.mock('@/lib/db/queries/jobs', () => ({
  updateJobStatus: vi.fn(),
  getJob: vi.fn(),
  createJob: vi.fn(),
  hasActiveJob: vi.fn(),
  getUserJobs: vi.fn(),
}))
vi.mock('@/lib/auth/require-owner', () => ({
  requireJobOwner: vi.fn(),
  requireDraftOwner: vi.fn(),
  requireRepoOwner: vi.fn(),
  ownershipErrorToResponse: vi.fn().mockReturnValue(null),
}))
vi.mock('@/lib/db/queries/repos', () => ({
  getRepo: vi.fn(),
  getUserRepos: vi.fn(),
  createRepo: vi.fn(),
  softDeleteRepo: vi.fn(),
  getRepoByGithubRepoId: vi.fn(),
  updateRepoWebhook: vi.fn(),
}))

const JOB_ID = 'job-uuid-5678'
const mockJob = { id: JOB_ID, userId: 'user-1', repoId: 'repo-1', status: 'completed' }
const mockDrafts = [
  { id: 'draft-1', platform: 'linkedin', content: 'LinkedIn post', status: 'draft' },
  { id: 'draft-2', platform: 'twitter', content: 'Twitter post', status: 'draft' },
]

function makeParams() {
  return { params: { jobId: JOB_ID } }
}

function makeGetRequest() {
  return new Request(`http://localhost/api/jobs/${JOB_ID}`)
}

function makeDeleteRequest() {
  return new Request(`http://localhost/api/jobs/${JOB_ID}`, { method: 'DELETE' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ownershipErrorToResponse).mockReturnValue(null)
  vi.mocked(requireJobOwner).mockResolvedValue(mockJob as any)
  vi.mocked(getDraftsByJob).mockResolvedValue(mockDrafts as any)
  vi.mocked(updateJobStatus).mockResolvedValue(undefined)
})

describe('GET /api/jobs/[jobId]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET(makeGetRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns job and drafts on success', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await GET(makeGetRequest(), makeParams())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.job.id).toBe(JOB_ID)
    expect(data.drafts).toHaveLength(2)
  })

  it('enforces job ownership', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await GET(makeGetRequest(), makeParams())
    expect(requireJobOwner).toHaveBeenCalledWith(JOB_ID, 'user-1')
  })

  it('returns 403 when user does not own job', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'attacker' } } as any)
    vi.mocked(requireJobOwner).mockRejectedValue(new Error('Forbidden'))
    vi.mocked(ownershipErrorToResponse).mockReturnValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    )
    const res = await GET(makeGetRequest(), makeParams())
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/jobs/[jobId]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('cancels job and returns 204', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await DELETE(makeDeleteRequest(), makeParams())
    expect(res.status).toBe(204)
    expect(updateJobStatus).toHaveBeenCalledWith(JOB_ID, 'cancelled')
  })

  it('enforces job ownership before cancelling', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await DELETE(makeDeleteRequest(), makeParams())
    expect(requireJobOwner).toHaveBeenCalledWith(JOB_ID, 'user-1')
  })
})
