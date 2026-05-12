import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRepo = { id: 'repo-1', userId: 'user-1' }
const mockDraft = { id: 'draft-1', userId: 'user-1' }
const mockJob = { id: 'job-1', userId: 'user-1' }

vi.mock('@/lib/db/queries/repos', () => ({ getRepo: vi.fn() }))
vi.mock('@/lib/db/queries/drafts', () => ({ getDraft: vi.fn() }))
vi.mock('@/lib/db/queries/jobs', () => ({ getJob: vi.fn() }))

describe('requireRepoOwner', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns repo when owner matches', async () => {
    const { getRepo } = await import('@/lib/db/queries/repos')
    vi.mocked(getRepo).mockResolvedValue(mockRepo as any)
    const { requireRepoOwner } = await import('@/lib/auth/require-owner')
    await expect(requireRepoOwner('repo-1', 'user-1')).resolves.toEqual(mockRepo)
  })

  it('throws 404 when repo not found', async () => {
    const { getRepo } = await import('@/lib/db/queries/repos')
    vi.mocked(getRepo).mockResolvedValue(undefined as any)
    const { requireRepoOwner, ownershipErrorToResponse } = await import('@/lib/auth/require-owner')
    const err = await requireRepoOwner('missing', 'user-1').catch(e => e)
    const res = ownershipErrorToResponse(err)
    expect(res?.status).toBe(404)
  })

  it('throws 403 when user does not own repo', async () => {
    const { getRepo } = await import('@/lib/db/queries/repos')
    vi.mocked(getRepo).mockResolvedValue(mockRepo as any)
    const { requireRepoOwner, ownershipErrorToResponse } = await import('@/lib/auth/require-owner')
    const err = await requireRepoOwner('repo-1', 'other-user').catch(e => e)
    const res = ownershipErrorToResponse(err)
    expect(res?.status).toBe(403)
  })
})

describe('requireDraftOwner', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns draft when owner matches', async () => {
    const { getDraft } = await import('@/lib/db/queries/drafts')
    vi.mocked(getDraft).mockResolvedValue(mockDraft as any)
    const { requireDraftOwner } = await import('@/lib/auth/require-owner')
    await expect(requireDraftOwner('draft-1', 'user-1')).resolves.toEqual(mockDraft)
  })

  it('throws 403 when user does not own draft', async () => {
    const { getDraft } = await import('@/lib/db/queries/drafts')
    vi.mocked(getDraft).mockResolvedValue(mockDraft as any)
    const { requireDraftOwner, ownershipErrorToResponse } = await import('@/lib/auth/require-owner')
    const err = await requireDraftOwner('draft-1', 'attacker').catch(e => e)
    const res = ownershipErrorToResponse(err)
    expect(res?.status).toBe(403)
  })
})

describe('requireJobOwner', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns job when owner matches', async () => {
    const { getJob } = await import('@/lib/db/queries/jobs')
    vi.mocked(getJob).mockResolvedValue(mockJob as any)
    const { requireJobOwner } = await import('@/lib/auth/require-owner')
    await expect(requireJobOwner('job-1', 'user-1')).resolves.toEqual(mockJob)
  })
})

describe('ownershipErrorToResponse', () => {
  it('returns null for non-ownership errors', async () => {
    const { ownershipErrorToResponse } = await import('@/lib/auth/require-owner')
    expect(ownershipErrorToResponse(new Error('random'))).toBeNull()
  })
})
