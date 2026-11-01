import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBulkApprove } from '@/lib/hooks/use-bulk-approve'
import { jsonResponse, makeItem } from './fixtures'

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))

beforeEach(() => vi.clearAllMocks())

describe('useBulkApprove', () => {
  it('approves drafts in order and reports one toast', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ item: makeItem({ id: 'a', draftId: 'd1', status: 'scheduled' }) }))
      .mockResolvedValueOnce(jsonResponse({ item: makeItem({ id: 'b', draftId: 'd2', status: 'scheduled' }) }))
    const onItem = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() => useBulkApprove(onItem, onDone))
    let count = 0
    await act(async () => {
      count = await result.current.approveAll(['d1', 'd2'])
    })
    expect(count).toBe(2)
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(urls).toEqual(['/api/drafts/d1/approve', '/api/drafts/d2/approve'])
    expect(onItem).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(mocks.toast.success).toHaveBeenCalledWith('Approved 2 drafts', expect.any(Object))
  })

  it('keeps going past failures and says how many worked', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid state', code: 'invalid_state' }, 409))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse({ item: makeItem({ draftId: 'd3' }) }))
    const { result } = renderHook(() => useBulkApprove(vi.fn()))
    await act(async () => {
      await result.current.approveAll(['d1', 'd2', 'd3'])
    })
    expect(mocks.toast.error).toHaveBeenCalledWith('Approved 1 of 3 drafts', expect.any(Object))
    expect(result.current.running).toBe(false)
  })

  it('does nothing for an empty list', async () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useBulkApprove(vi.fn()))
    await act(async () => {
      await result.current.approveAll([])
    })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})
