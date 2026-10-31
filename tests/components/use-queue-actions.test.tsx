import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueueActions } from '@/lib/hooks/use-queue-actions'
import { jsonResponse, makeItem } from './fixtures'

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() })
  return { toast, handlePlanError: vi.fn(), openUpgrade: vi.fn() }
})

vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('@/components/billing/upgrade-provider', () => ({
  useUpgrade: () => ({ handlePlanError: mocks.handlePlanError, openUpgrade: mocks.openUpgrade }),
}))

const TZ = 'Asia/Kolkata'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlePlanError.mockResolvedValue(true)
  window.open = vi.fn().mockReturnValue({}) as unknown as typeof window.open
})

describe('useQueueActions', () => {
  it('approves a draft and reports the slot', async () => {
    const item = makeItem({ status: 'scheduled', approvedAt: '2026-11-03T04:00:00Z' })
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ item }))
    const onItem = vi.fn()
    const { result } = renderHook(() => useQueueActions({ timezone: TZ, onItem }))

    let returned: unknown
    await act(async () => {
      returned = await result.current.approve(item.draftId)
    })

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/drafts/${item.draftId}/approve`,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(returned).toEqual(item)
    expect(onItem).toHaveBeenCalledWith(item)
    expect(mocks.toast.success).toHaveBeenCalledWith('Approved', expect.objectContaining({ description: expect.stringContaining('It goes out') }))
    expect(result.current.pending).toEqual({})
  })

  it('schedules at a time and says when', async () => {
    const at = new Date('2026-11-05T03:30:00.000Z')
    const item = makeItem({ status: 'scheduled', scheduledFor: at.toISOString() })
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ item }))
    const { result } = renderHook(() => useQueueActions({ timezone: TZ }))

    await act(async () => {
      await result.current.schedule(item.draftId, at)
    })

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ at: at.toISOString() })
    expect(mocks.toast.success).toHaveBeenCalledWith('Scheduled for Thu, 9:00')
  })

  it('asks for the next free slot when no time is given', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ item: makeItem({ status: 'scheduled' }) }))
    const { result } = renderHook(() => useQueueActions({ timezone: TZ }))
    await act(async () => {
      await result.current.schedule('draft-x')
    })
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({})
  })

  it('hands plan errors to the upgrade dialog', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Limit', code: 'limit_reached', limit: 'queuedPosts', used: 3, max: 3 }, 402),
    )
    const onItem = vi.fn()
    const { result } = renderHook(() => useQueueActions({ timezone: TZ, onItem }))
    let returned: unknown = 'unset'
    await act(async () => {
      returned = await result.current.schedule('draft-x')
    })
    expect(returned).toBeNull()
    expect(mocks.handlePlanError).toHaveBeenCalled()
    expect(onItem).not.toHaveBeenCalled()
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it('explains known error codes', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Taken', code: 'slot_taken' }, 409))
    const { result } = renderHook(() => useQueueActions({ timezone: TZ }))
    await act(async () => {
      await result.current.schedule('draft-x', new Date('2026-11-05T03:30:00Z'))
    })
    expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't schedule this draft", {
      description: 'That slot already has a post for this platform. Pick another time.',
    })
  })

  it('reports network failures', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useQueueActions({ timezone: TZ }))
    await act(async () => {
      await result.current.skip('draft-x')
    })
    expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't skip this draft", {
      description: 'Check your connection and try again.',
    })
  })

  it('opens X with the post before asking the server to mark it ready', async () => {
    const item = makeItem({ platform: 'twitter', status: 'ready' })
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ item, result: { method: 'x_intent', url: null, intentUrl: 'https://x.com/intent/post?text=hi' } }),
    )
    const { result } = renderHook(() => useQueueActions({ timezone: TZ }))
    await act(async () => {
      await result.current.publishNow({ draftId: item.draftId, platform: 'twitter', content: 'Shipped it', hashtags: [] })
    })
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('https://x.com/intent/post?text='), '_blank', 'noopener,noreferrer')
    expect(global.fetch).toHaveBeenCalledWith(`/api/drafts/${item.draftId}/publish`, expect.objectContaining({ method: 'POST' }))
    expect(mocks.toast.info).toHaveBeenCalledWith(
      'Opened X with your post',
      expect.objectContaining({ action: expect.objectContaining({ label: 'I posted it' }) }),
    )
  })

  it('publishes to LinkedIn directly when connected', async () => {
    const item = makeItem({ status: 'published', publishMethod: 'linkedin_api', externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1/' })
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ item, result: { method: 'linkedin_api', url: item.externalUrl, intentUrl: null } }),
    )
    const { result } = renderHook(() => useQueueActions({ timezone: TZ, linkedinDirect: true }))
    await act(async () => {
      await result.current.publishNow({ draftId: item.draftId, platform: 'linkedin', content: 'Post', hashtags: [] })
    })
    expect(window.open).not.toHaveBeenCalled()
    expect(mocks.toast.success).toHaveBeenCalledWith(
      'Published to LinkedIn',
      expect.objectContaining({ action: expect.objectContaining({ label: 'View post' }) }),
    )
  })

  it('marks a post as posted with the method', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ item: makeItem({ status: 'published' }) }))
    const { result } = renderHook(() => useQueueActions({ timezone: TZ }))
    await act(async () => {
      await result.current.markPosted('draft-x', 'x_intent', 'https://x.com/me/status/1')
    })
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/drafts/draft-x/posted')
    expect(JSON.parse(init.body)).toEqual({ method: 'x_intent', url: 'https://x.com/me/status/1' })
    expect(mocks.toast.success).toHaveBeenCalledWith('Marked as posted')
  })

  it('tracks pending actions per draft', async () => {
    let resolve: (r: Response) => void = () => {}
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    const { result } = renderHook(() => useQueueActions({ timezone: TZ }))
    let pending: Promise<unknown> = Promise.resolve()
    act(() => {
      pending = result.current.unschedule('draft-x')
    })
    expect(result.current.isPending('draft-x', 'unschedule')).toBe(true)
    expect(result.current.isPending('draft-y')).toBe(false)
    await act(async () => {
      resolve(jsonResponse({ item: makeItem({ status: 'approved', scheduledFor: null }) }))
      await pending
    })
    expect(result.current.isPending('draft-x')).toBe(false)
  })
})
