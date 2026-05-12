import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { softDeleteRepo } from '@/lib/db/queries/repos'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { DELETE } from '@/app/api/repos/[repoId]/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => ({
  softDeleteRepo: vi.fn(),
  getUserRepos: vi.fn(),
  createRepo: vi.fn(),
  getRepo: vi.fn(),
}))
vi.mock('@/lib/auth/require-owner', () => ({
  requireRepoOwner: vi.fn(),
  requireDraftOwner: vi.fn(),
  requireJobOwner: vi.fn(),
  ownershipErrorToResponse: vi.fn().mockReturnValue(null),
}))

const REPO_ID = 'repo-uuid-1234'
const mockRepo = { id: REPO_ID, userId: 'user-1', fullName: 'user/repo' }

function makeParams() {
  return { params: { repoId: REPO_ID } }
}

function makeRequest() {
  return new Request(`http://localhost/api/repos/${REPO_ID}`, { method: 'DELETE' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ownershipErrorToResponse).mockReturnValue(null)
  vi.mocked(requireRepoOwner).mockResolvedValue(mockRepo as any)
  vi.mocked(softDeleteRepo).mockResolvedValue(undefined)
})

describe('DELETE /api/repos/[repoId]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('soft-deletes repo and returns 204', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(204)
    expect(softDeleteRepo).toHaveBeenCalledWith(REPO_ID)
  })

  it('enforces repo ownership before deleting', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await DELETE(makeRequest(), makeParams())
    expect(requireRepoOwner).toHaveBeenCalledWith(REPO_ID, 'user-1')
  })

  it('returns 403 when user does not own repo', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'attacker' } } as any)
    vi.mocked(requireRepoOwner).mockRejectedValue(new Error('Forbidden'))
    vi.mocked(ownershipErrorToResponse).mockReturnValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    )
    const res = await DELETE(makeRequest(), makeParams())
    expect(res.status).toBe(403)
    expect(softDeleteRepo).not.toHaveBeenCalled()
  })
})
