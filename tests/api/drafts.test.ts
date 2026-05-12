import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { updateDraftContent, markDraftCopied } from '@/lib/db/queries/drafts'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { PATCH, POST } from '@/app/api/drafts/[draftId]/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/drafts', () => ({
  updateDraftContent: vi.fn(),
  markDraftCopied: vi.fn(),
  getDraftsByJob: vi.fn(),
  getDraft: vi.fn(),
  replaceDraft: vi.fn(),
}))
vi.mock('@/lib/auth/require-owner', () => ({
  requireDraftOwner: vi.fn(),
  requireJobOwner: vi.fn(),
  requireRepoOwner: vi.fn(),
  ownershipErrorToResponse: vi.fn().mockReturnValue(null),
}))

const DRAFT_ID = 'draft-uuid-1234'
const mockDraft = { id: DRAFT_ID, userId: 'user-1', platform: 'linkedin', content: 'Hello' }

function makeParams() {
  return { params: { draftId: DRAFT_ID } }
}

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/drafts/${DRAFT_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postRequest() {
  return new Request(`http://localhost/api/drafts/${DRAFT_ID}`, { method: 'POST' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ownershipErrorToResponse).mockReturnValue(null)
  vi.mocked(requireDraftOwner).mockResolvedValue(mockDraft as any)
  vi.mocked(updateDraftContent).mockResolvedValue({ ...mockDraft, content: 'Updated' } as any)
  vi.mocked(markDraftCopied).mockResolvedValue(undefined)
})

describe('PATCH /api/drafts/[draftId]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await PATCH(patchRequest({ content: 'New content' }), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 400 for empty content', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(patchRequest({ content: '' }), makeParams())
    expect(res.status).toBe(400)
  })

  it('returns 400 when content missing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(patchRequest({}), makeParams())
    expect(res.status).toBe(400)
  })

  it('returns updated draft on success', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(patchRequest({ content: 'Updated content' }), makeParams())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.draft).toBeTruthy()
    expect(updateDraftContent).toHaveBeenCalledWith(DRAFT_ID, 'Updated content')
  })

  it('enforces draft ownership', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await PATCH(patchRequest({ content: 'Updated content' }), makeParams())
    expect(requireDraftOwner).toHaveBeenCalledWith(DRAFT_ID, 'user-1')
  })

  it('returns ownership error when user does not own draft', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'attacker' } } as any)
    vi.mocked(requireDraftOwner).mockRejectedValue(new Error('Forbidden'))
    vi.mocked(ownershipErrorToResponse).mockReturnValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    )
    const res = await PATCH(patchRequest({ content: 'x' }), makeParams())
    expect(res.status).toBe(403)
  })
})

describe('POST /api/drafts/[draftId] (mark copied)', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(postRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(postRequest(), makeParams())
    expect(res.status).toBe(204)
    expect(markDraftCopied).toHaveBeenCalledWith(DRAFT_ID)
  })

  it('enforces draft ownership', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await POST(postRequest(), makeParams())
    expect(requireDraftOwner).toHaveBeenCalledWith(DRAFT_ID, 'user-1')
  })
})
