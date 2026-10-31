import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueueActions } from '@/lib/hooks/use-queue-actions'
import { QueueList } from '@/components/app/queue-list'
import { DraftActions } from '@/components/app/draft-actions'
import { makeItem } from './fixtures'

vi.mock('@/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() }),
}))

function fakeActions(overrides: Partial<QueueActions> = {}): QueueActions {
  return {
    approve: vi.fn().mockResolvedValue(null),
    schedule: vi.fn().mockResolvedValue(null),
    unschedule: vi.fn().mockResolvedValue(null),
    skip: vi.fn().mockResolvedValue(null),
    publishNow: vi.fn().mockResolvedValue(null),
    markPosted: vi.fn().mockResolvedValue(null),
    pending: {},
    isPending: () => false,
    ...overrides,
  }
}

const TZ = 'UTC'

beforeEach(() => vi.clearAllMocks())

describe('QueueList', () => {
  it('renders one row per item with its state, platform and source', () => {
    render(
      <QueueList
        aria-label="Queue"
        items={[
          makeItem({ id: 'a', status: 'pending_review' }),
          makeItem({ id: 'b', status: 'scheduled', platform: 'twitter' }),
        ]}
        timezone={TZ}
        linkedinDirect={false}
        actions={fakeActions()}
        onOpen={vi.fn()}
      />,
    )
    const list = screen.getByRole('list', { name: 'Queue' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('img', { name: 'Needs review' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Scheduled' })).toBeTruthy()
    expect(screen.getAllByText('fix: race in webhook retry')).toHaveLength(2)
    expect(screen.getAllByText('Merged PR')).toHaveLength(2)
  })

  it('opens the editor from the preview', () => {
    const onOpen = vi.fn()
    const item = makeItem()
    render(
      <QueueList items={[item]} timezone={TZ} linkedinDirect={false} actions={fakeActions()} onOpen={onOpen} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /open linkedin draft/i }))
    expect(onOpen).toHaveBeenCalledWith(item)
  })

  it('shows the empty state when there are no items', () => {
    render(
      <QueueList
        items={[]}
        timezone={TZ}
        linkedinDirect={false}
        actions={fakeActions()}
        onOpen={vi.fn()}
        empty={<p>Nothing waiting</p>}
      />,
    )
    expect(screen.getByText('Nothing waiting')).toBeTruthy()
  })

  it('shows the last error on failed rows', () => {
    render(
      <QueueList
        items={[makeItem({ status: 'failed', lastError: 'LinkedIn rejected the post: token expired.' })]}
        timezone={TZ}
        linkedinDirect
        actions={fakeActions()}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('LinkedIn rejected the post: token expired.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry now/i })).toBeTruthy()
  })
})

describe('DraftActions', () => {
  const draft = { draftId: 'd1', platform: 'linkedin' as const, content: 'Post', hashtags: [] }

  it('offers Add to queue for an unqueued draft', async () => {
    const actions = fakeActions()
    render(<DraftActions draft={draft} item={null} actions={actions} timezone={TZ} linkedinDirect={false} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /add to queue/i }))
    expect(actions.schedule).toHaveBeenCalledWith('d1')
  })

  it('approves a draft waiting for review', async () => {
    const actions = fakeActions()
    render(
      <DraftActions draft={draft} item={makeItem({ draftId: 'd1' })} actions={actions} timezone={TZ} linkedinDirect={false} />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /^approve$/i }))
    expect(actions.approve).toHaveBeenCalledWith('d1')
  })

  it('posts a ready X draft and lets you mark it posted', async () => {
    const actions = fakeActions()
    const user = userEvent.setup()
    render(
      <DraftActions
        draft={{ ...draft, platform: 'twitter' }}
        item={makeItem({ draftId: 'd1', platform: 'twitter', status: 'ready' })}
        actions={actions}
        timezone={TZ}
        linkedinDirect={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: /post on x/i }))
    expect(actions.publishNow).toHaveBeenCalledWith({ draftId: 'd1', platform: 'twitter', content: 'Post', hashtags: [] })
    await user.click(screen.getByRole('button', { name: /i posted it/i }))
    expect(actions.markPosted).toHaveBeenCalledWith('d1', 'x_intent')
  })

  it('labels LinkedIn publishing by connection', () => {
    const item = makeItem({ draftId: 'd1', status: 'ready' })
    const { rerender } = render(
      <DraftActions draft={draft} item={item} actions={fakeActions()} timezone={TZ} linkedinDirect={false} />,
    )
    expect(screen.getByRole('button', { name: /post on linkedin/i })).toBeTruthy()
    rerender(<DraftActions draft={draft} item={item} actions={fakeActions()} timezone={TZ} linkedinDirect />)
    expect(screen.getByRole('button', { name: /publish now/i })).toBeTruthy()
  })

  it('links to the live post once published', () => {
    render(
      <DraftActions
        draft={draft}
        item={makeItem({ draftId: 'd1', status: 'published', externalUrl: 'https://www.linkedin.com/feed/update/x/' })}
        actions={fakeActions()}
        timezone={TZ}
        linkedinDirect
      />,
    )
    expect(screen.getByRole('link', { name: /view post/i }).getAttribute('href')).toBe('https://www.linkedin.com/feed/update/x/')
  })

  it('shows a disabled publishing state without a menu', () => {
    render(
      <DraftActions
        draft={draft}
        item={makeItem({ draftId: 'd1', status: 'publishing' })}
        actions={fakeActions()}
        timezone={TZ}
        linkedinDirect
      />,
    )
    expect(screen.getByRole('button', { name: /publishing/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /more actions/i })).toBeNull()
  })

  it('opens the schedule dialog from the menu and schedules the next slot', async () => {
    const actions = fakeActions({ schedule: vi.fn().mockResolvedValue(makeItem()) })
    const user = userEvent.setup()
    render(<DraftActions draft={draft} item={null} actions={actions} timezone={TZ} linkedinDirect={false} />)
    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(await screen.findByRole('menuitem', { name: /schedule/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Times are in/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /add to next slot/i }))
    await waitFor(() => expect(actions.schedule).toHaveBeenCalledWith('d1', undefined))
  })
})
