import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostCard } from '@/components/post-card'
import { jsonResponse, makeItem } from './fixtures'

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() })
  return { toast, handlePlanError: vi.fn(), openUpgrade: vi.fn() }
})

vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('@/components/billing/upgrade-provider', () => ({
  useUpgrade: () => ({ handlePlanError: mocks.handlePlanError, openUpgrade: mocks.openUpgrade }),
}))

const defaultProps = {
  draftId: 'draft-123',
  platform: 'linkedin' as const,
  content: 'Hello LinkedIn world', // 20 chars
  hashtags: ['#coding', '#typescript'],
  status: 'generated',
}

let clipboardWriteText: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  clipboardWriteText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    get: () => ({ writeText: clipboardWriteText }),
    configurable: true,
  })
  global.fetch = vi.fn().mockResolvedValue(jsonResponse({}))
  mocks.handlePlanError.mockResolvedValue(true)
})

async function clickAndFlush(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button)
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

function textbox() {
  return screen.getByRole('textbox', { name: /post text/i })
}

describe('PostCard', () => {
  it('renders the platform and the content', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByRole('heading', { name: 'LinkedIn post' })).toBeTruthy()
    expect(screen.getByDisplayValue('Hello LinkedIn world')).toBeTruthy()
  })

  it('calls the X version "X post"', () => {
    render(<PostCard {...defaultProps} platform="twitter" />)
    expect(screen.getByRole('heading', { name: 'X post' })).toBeTruthy()
  })

  it('counts characters against the platform limit', () => {
    const { unmount } = render(<PostCard {...defaultProps} />)
    expect(screen.getByText('/3,000')).toBeTruthy()
    expect(screen.getByText('20')).toBeTruthy()
    unmount()
    render(<PostCard {...defaultProps} platform="twitter" />)
    expect(screen.getByText('/280')).toBeTruthy()
  })

  it('flags and blocks text over the limit', () => {
    render(<PostCard {...defaultProps} platform="twitter" />)
    fireEvent.change(textbox(), { target: { value: 'a'.repeat(281) } })
    expect(screen.getByText('281').closest('[data-state]')?.getAttribute('data-state')).toBe('over')
    expect(screen.getByText(/X allows 280 characters/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /copy post/i })).toBeDisabled()
  })

  it('renders hashtags', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('#coding')).toBeTruthy()
    expect(screen.getByText('#typescript')).toBeTruthy()
  })

  it('shows a Copied badge when the draft was copied', () => {
    render(<PostCard {...defaultProps} status="copied" />)
    expect(screen.getByText('Copied')).toBeTruthy()
  })

  it('only enables Save after an edit, then saves with PATCH', async () => {
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} />)
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    fireEvent.change(textbox(), { target: { value: 'Edited text' } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/drafts/draft-123', expect.objectContaining({ method: 'PATCH' })),
    )
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body).toEqual({ content: 'Edited text' })
    await waitFor(() => expect(screen.getAllByText('Saved').length).toBeGreaterThan(0))
  })

  it('shows an error when saving fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 500))
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} />)
    fireEvent.change(textbox(), { target: { value: 'Edited text' } })
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Failed to save'))
  })

  it('saves with Ctrl+S', async () => {
    render(<PostCard {...defaultProps} />)
    fireEvent.change(textbox(), { target: { value: 'Keyboard save' } })
    await act(async () => {
      fireEvent.keyDown(textbox(), { key: 's', ctrlKey: true })
    })
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/drafts/draft-123', expect.objectContaining({ method: 'PATCH' })),
    )
  })

  it('copies the text with hashtags and marks the draft copied', async () => {
    const onCopied = vi.fn()
    render(<PostCard {...defaultProps} onCopied={onCopied} />)
    await clickAndFlush(screen.getByRole('button', { name: /copy post/i }))
    expect(clipboardWriteText).toHaveBeenCalledWith('Hello LinkedIn world\n\n#coding #typescript')
    expect(global.fetch).toHaveBeenCalledWith('/api/drafts/draft-123', expect.objectContaining({ method: 'POST' }))
    expect(onCopied).toHaveBeenCalled()
  })

  it('rewrites the draft through the replace route', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ draft: { originalContent: 'Regenerated content', platformMetadata: { hashtags: ['#new'] } } }, 201),
    )
    render(<PostCard {...defaultProps} />)
    await clickAndFlush(screen.getByTitle('Regenerate'))
    await waitFor(() => expect(screen.getByDisplayValue('Regenerated content')).toBeTruthy())
    expect(global.fetch).toHaveBeenCalledWith('/api/drafts/draft-123/replace', expect.objectContaining({ method: 'POST' }))
    expect(screen.getByText('#new')).toBeTruthy()
  })

  it('opens the upgrade dialog when rewriting hits the plan limit', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 'limit_reached' }, 402))
    render(<PostCard {...defaultProps} />)
    await clickAndFlush(screen.getByTitle('Regenerate'))
    await waitFor(() => expect(mocks.handlePlanError).toHaveBeenCalled())
    expect(screen.getByDisplayValue('Hello LinkedIn world')).toBeTruthy()
  })

  it('switches between versions', () => {
    render(
      <PostCard
        platform="linkedin"
        variants={[
          { id: 'v1', sequenceNumber: 1, content: 'First version', hashtags: [], status: 'generated' },
          { id: 'v2', sequenceNumber: 2, content: 'Second version', hashtags: [], status: 'generated' },
        ]}
      />,
    )
    expect(screen.getByDisplayValue('First version')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Version 2' }))
    expect(screen.getByDisplayValue('Second version')).toBeTruthy()
  })

  it('shows a Pro lock for versions when the plan lacks them', async () => {
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} canUseVariants={false} />)
    await user.click(screen.getByRole('button', { name: /write more versions/i }))
    await user.click(screen.getByRole('button', { name: /write 3 versions/i }))
    expect(mocks.openUpgrade).toHaveBeenCalledWith({ code: 'feature_locked', feature: 'drafts.variants' }, 'pro')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('requests three versions with the dial values', async () => {
    const onVariantsCreated = vi.fn()
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} onVariantsCreated={onVariantsCreated} />)
    await user.click(screen.getByRole('button', { name: /write more versions/i }))
    await user.click(screen.getByRole('button', { name: /write 3 versions/i }))
    await waitFor(() => expect(onVariantsCreated).toHaveBeenCalled())
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/drafts/draft-123/variants')
    expect(JSON.parse(init.body)).toEqual({ technical: 50, engagement: 50, creativity: 50, count: 3 })
  })

  it('adds an unqueued draft to the next free slot', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ item: makeItem({ draftId: 'draft-123', status: 'scheduled' }) }))
    const onQueueItem = vi.fn()
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} onQueueItem={onQueueItem} timezone="Asia/Kolkata" />)
    await user.click(screen.getByRole('button', { name: /add to queue/i }))
    await waitFor(() => expect(onQueueItem).toHaveBeenCalled())
    expect(global.fetch).toHaveBeenCalledWith('/api/drafts/draft-123/schedule', expect.objectContaining({ method: 'POST' }))
  })

  it('offers Approve for a draft waiting for review', () => {
    render(
      <PostCard
        {...defaultProps}
        queueByDraft={{ 'draft-123': makeItem({ draftId: 'draft-123', status: 'pending_review' }) }}
      />,
    )
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeTruthy()
    expect(screen.getByText('Needs review')).toBeTruthy()
  })

  it('asks to save edits before queueing', () => {
    render(<PostCard {...defaultProps} />)
    fireEvent.change(textbox(), { target: { value: 'Changed' } })
    expect(screen.queryByRole('button', { name: /add to queue/i })).toBeNull()
    expect(screen.getByText('Save your edits to queue this post.')).toBeTruthy()
  })
})
