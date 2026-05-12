import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PostCard } from '@/components/post-card'

const defaultProps = {
  draftId: 'draft-123',
  platform: 'linkedin' as const,
  content: 'Hello LinkedIn world', // 20 chars
  hashtags: ['#coding', '#typescript'],
  status: 'draft',
}

let clipboardWriteText: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  clipboardWriteText = vi.fn().mockResolvedValue(undefined)
  // Use getter so it survives any property redefinition by user-event
  Object.defineProperty(navigator, 'clipboard', {
    get: () => ({ writeText: clipboardWriteText }),
    configurable: true,
  })
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => {
  vi.useRealTimers()
})

// Helper: click a button and flush all pending microtasks
async function clickAndFlush(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button)
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

describe('PostCard', () => {
  it('renders platform label and content', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('LinkedIn Post')).toBeTruthy()
    expect(screen.getByDisplayValue('Hello LinkedIn world')).toBeTruthy()
  })

  it('renders twitter label for twitter platform', () => {
    render(<PostCard {...defaultProps} platform="twitter" />)
    expect(screen.getByText('Twitter / X')).toBeTruthy()
  })

  it('shows character count for linkedin', () => {
    render(<PostCard {...defaultProps} />)
    // Counter is split across two spans: "20" + "/3000"
    expect(screen.getByText('20')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.textContent === '/3000')).toBeTruthy()
  })

  it('shows 280 limit for twitter', () => {
    render(<PostCard {...defaultProps} platform="twitter" />)
    expect(screen.getByText('20')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.textContent === '/280')).toBeTruthy()
  })

  it('shows over-limit in red when content exceeds limit', () => {
    render(<PostCard {...defaultProps} platform="twitter" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(281) } })
    // Counter uses inline style color for over-limit, not a class
    const counter = screen.getByText('281')
    expect(counter).toHaveStyle({ color: 'rgb(255, 180, 171)' })
  })

  it('disables save and copy when over limit', () => {
    render(<PostCard {...defaultProps} platform="twitter" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(281) } })
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /copy/i })).toBeDisabled()
  })

  it('renders hashtags', () => {
    render(<PostCard {...defaultProps} />)
    expect(screen.getByText('#coding')).toBeTruthy()
    expect(screen.getByText('#typescript')).toBeTruthy()
  })

  it('shows Copied badge when status is copied', () => {
    render(<PostCard {...defaultProps} status="copied" />)
    expect(screen.getByText('Copied')).toBeTruthy()
  })

  it('saves content on save button click', async () => {
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/drafts/draft-123',
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('shows Saved after successful save', async () => {
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy())
  })

  it('shows error when save fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const user = userEvent.setup()
    render(<PostCard {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(screen.getByText('Failed to save')).toBeTruthy())
  })

  it('copies full text with hashtags on copy click', async () => {
    render(<PostCard {...defaultProps} />)
    await clickAndFlush(screen.getByRole('button', { name: /copy/i }))
    expect(clipboardWriteText).toHaveBeenCalledWith(
      'Hello LinkedIn world\n\n#coding #typescript'
    )
  })

  it('calls onCopied callback after copy', async () => {
    const onCopied = vi.fn()
    render(<PostCard {...defaultProps} onCopied={onCopied} />)
    await clickAndFlush(screen.getByRole('button', { name: /copy/i }))
    expect(onCopied).toHaveBeenCalled()
  })

  it('calls POST to mark draft copied', async () => {
    render(<PostCard {...defaultProps} />)
    await clickAndFlush(screen.getByRole('button', { name: /copy/i }))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/drafts/draft-123',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('updates content via textarea', () => {
    render(<PostCard {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'New content here' } })
    expect(screen.getByDisplayValue('New content here')).toBeTruthy()
  })

  it('regenerate button calls replace API and updates content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ draft: { content: 'Regenerated content' } }),
    })
    render(<PostCard {...defaultProps} />)
    // Regenerate button has title="Regenerate" (SVG icon, no text label)
    await clickAndFlush(screen.getByTitle('Regenerate'))
    await waitFor(() => {
      expect(screen.getByDisplayValue('Regenerated content')).toBeTruthy()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/drafts/draft-123/replace',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
