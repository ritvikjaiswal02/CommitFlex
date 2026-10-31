import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/autopilot/approval', () => ({
  resolveApprovalToken: vi.fn(),
  consumeApprovalToken: vi.fn(),
  releaseApprovalTokenClaim: vi.fn(async () => {}),
  isApprovalAction: (v: unknown) => v === 'approve' || v === 'skip' || v === 'posted',
}))
vi.mock('@/lib/autopilot/queue', () => ({ approveQueueRow: vi.fn(), recordManualPublish: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({
  transitionQueueItem: vi.fn(async (id: string, _from: string[], patch: any) => ({ ...item, id, ...patch })),
}))
vi.mock('@/lib/plans', () => ({ isPlanError: (err: any) => err?.name === 'PlanError' }))

import { consumeApprovalToken, releaseApprovalTokenClaim, resolveApprovalToken } from '@/lib/autopilot/approval'
import { approveQueueRow, recordManualPublish } from '@/lib/autopilot/queue'
import { transitionQueueItem } from '@/lib/db/queries/autopilot'
import { GET, POST } from '@/app/api/drafts/approve/route'

const at = new Date('2026-11-03T03:30:00Z')
const item = { id: 'item-1', userId: 'user-1', draftId: 'draft-1', platform: 'linkedin', status: 'pending_review', scheduledFor: at } as any
type Action = 'approve' | 'skip' | 'posted'
const ok = (actions: Action[] = ['approve', 'skip', 'posted']) => ({
  status: 'ok' as const,
  item,
  email: 'dev@example.com',
  tokenId: 'tok-1',
  userId: 'user-1',
  actions,
})

function get(query: string) {
  return GET(new Request(`http://localhost/api/drafts/approve?${query}`))
}

function post(fields: Record<string, string>, headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' }) {
  return POST(
    new Request('http://localhost/api/drafts/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(fields).toString(),
    }),
  )
}

function location(res: Response) {
  const url = new URL(res.headers.get('location')!)
  return { path: url.pathname, params: Object.fromEntries(url.searchParams.entries()) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveApprovalToken).mockResolvedValue(ok())
  vi.mocked(consumeApprovalToken).mockResolvedValue(true)
  vi.mocked(approveQueueRow).mockResolvedValue({ item: { ...item, status: 'scheduled' }, changed: true })
})

describe('GET /api/drafts/approve (email link)', () => {
  it('changes nothing and redirects to the confirmation page', async () => {
    const res = await get('token=abc&action=skip')
    expect(res.status).toBe(303)
    const loc = location(res)
    expect(loc.path).toBe('/queue/approved')
    expect(loc.params).toEqual({ token: 'abc', action: 'skip', preview: '1' })
    expect(consumeApprovalToken).not.toHaveBeenCalled()
    expect(approveQueueRow).not.toHaveBeenCalled()
    expect(transitionQueueItem).not.toHaveBeenCalled()
    expect(recordManualPublish).not.toHaveBeenCalled()
  })

  it('reports invalid, expired and already-used tokens', async () => {
    vi.mocked(resolveApprovalToken).mockResolvedValueOnce({ status: 'invalid' })
    expect(location(await get('token=x')).params.status).toBe('invalid')
    vi.mocked(resolveApprovalToken).mockResolvedValueOnce({ status: 'expired', item })
    expect(location(await get('token=x')).params.status).toBe('expired')
    vi.mocked(resolveApprovalToken).mockResolvedValueOnce({ status: 'used', item, email: 'a@b.c' })
    expect(location(await get('token=x')).params.status).toBe('already')
  })

  it('rejects an action the token was not issued for', async () => {
    vi.mocked(resolveApprovalToken).mockResolvedValueOnce(ok(['approve']))
    expect(location(await get('token=abc&action=skip')).params.status).toBe('invalid')
  })

  it('never throws: unexpected errors redirect as invalid', async () => {
    vi.mocked(resolveApprovalToken).mockRejectedValueOnce(new Error('db down'))
    const res = await get('token=abc')
    expect(res.status).toBe(303)
    expect(location(res).params.status).toBe('invalid')
  })
})

describe('POST /api/drafts/approve (confirmation form)', () => {
  it('claims the token, approves and redirects with 303', async () => {
    const res = await post({ token: 'abc', action: 'approve' })
    expect(res.status).toBe(303)
    const loc = location(res)
    expect(loc.path).toBe('/queue/approved')
    expect(loc.params).toMatchObject({ status: 'approved', draft: 'draft-1', platform: 'linkedin', at: at.toISOString() })
    expect(consumeApprovalToken).toHaveBeenCalledWith('tok-1')
    expect(approveQueueRow).toHaveBeenCalledWith(item, 'dev@example.com')
  })

  it('does nothing when another request already claimed the token', async () => {
    vi.mocked(consumeApprovalToken).mockResolvedValueOnce(false)
    expect(location(await post({ token: 'abc', action: 'approve' })).params.status).toBe('already')
    expect(approveQueueRow).not.toHaveBeenCalled()
  })

  it('refuses cross-site posts', async () => {
    const res = await post({ token: 'abc', action: 'approve' }, { 'sec-fetch-site': 'cross-site' })
    expect(res.status).toBe(403)
    expect(consumeApprovalToken).not.toHaveBeenCalled()
  })

  it('refuses a foreign Origin', async () => {
    const res = await post({ token: 'abc', action: 'approve' }, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
  })

  it('does not let a reviewer token skip', async () => {
    vi.mocked(resolveApprovalToken).mockResolvedValueOnce(ok(['approve']))
    expect(location(await post({ token: 'abc', action: 'skip' })).params.status).toBe('invalid')
    expect(transitionQueueItem).not.toHaveBeenCalled()
  })

  it('skips with a conditional transition', async () => {
    const res = await post({ token: 'abc', action: 'skip' })
    expect(location(res).params.status).toBe('skipped')
    expect(transitionQueueItem).toHaveBeenCalledWith(
      'item-1',
      expect.arrayContaining(['pending_review']),
      expect.objectContaining({ status: 'skipped' }),
    )
  })

  it('marks posted', async () => {
    const res = await post({ token: 'abc', action: 'posted' })
    expect(location(res).params.status).toBe('posted')
    expect(recordManualPublish).toHaveBeenCalledWith({ userId: 'user-1', draftId: 'draft-1', method: 'manual' })
  })

  it('says already when the item was approved elsewhere', async () => {
    vi.mocked(resolveApprovalToken).mockResolvedValueOnce({ ...ok(), item: { ...item, status: 'scheduled' } })
    expect(location(await post({ token: 'abc', action: 'approve' })).params.status).toBe('already')
    expect(consumeApprovalToken).not.toHaveBeenCalled()
  })

  it('reports a full queue as limit and gives the token back', async () => {
    vi.mocked(approveQueueRow).mockRejectedValueOnce(Object.assign(new Error('full'), { name: 'PlanError' }))
    expect(location(await post({ token: 'abc', action: 'approve' })).params.status).toBe('limit')
    expect(releaseApprovalTokenClaim).toHaveBeenCalledWith('tok-1')
  })

  it('rejects an unknown action', async () => {
    expect(location(await post({ token: 'abc', action: 'publish' })).params.status).toBe('invalid')
  })
})
