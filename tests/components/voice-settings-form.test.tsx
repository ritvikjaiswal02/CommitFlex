import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VoiceSettingsForm } from '@/components/voice-settings-form'

const defaultProps = {
  initialTone: 'professional',
  initialTechnicalLevel: 7,
  initialAudience: 'developers',
  initialExtraContext: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('VoiceSettingsForm', () => {
  it('renders initial tone selection', () => {
    render(<VoiceSettingsForm {...defaultProps} />)
    // The active tone button should be rendered
    expect(screen.getByText('professional')).toBeTruthy()
    expect(screen.getByText('casual')).toBeTruthy()
    expect(screen.getByText('enthusiastic')).toBeTruthy()
  })

  it('renders initial audience selection', () => {
    render(<VoiceSettingsForm {...defaultProps} />)
    expect(screen.getByText('developers')).toBeTruthy()
    expect(screen.getByText('engineering leaders')).toBeTruthy()
  })

  it('renders technical level slider with initial value', () => {
    render(<VoiceSettingsForm {...defaultProps} />)
    expect(screen.getByText(/technical level: 7\/10/i)).toBeTruthy()
    const slider = screen.getByRole('slider')
    expect((slider as HTMLInputElement).value).toBe('7')
  })

  it('renders save button', () => {
    render(<VoiceSettingsForm {...defaultProps} />)
    expect(screen.getByRole('button', { name: /save voice settings/i })).toBeTruthy()
  })

  it('changes tone when a tone button is clicked', async () => {
    const user = userEvent.setup()
    render(<VoiceSettingsForm {...defaultProps} />)
    await user.click(screen.getByText('casual'))
    // Label should update — the button turns blue (bg-blue-600) but we test via save payload
    await user.click(screen.getByRole('button', { name: /save voice settings/i }))
    await waitFor(() => {
      const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(body.tone).toBe('casual')
    })
  })

  it('changes audience when an audience button is clicked', async () => {
    const user = userEvent.setup()
    render(<VoiceSettingsForm {...defaultProps} />)
    await user.click(screen.getByText('product managers'))
    await user.click(screen.getByRole('button', { name: /save voice settings/i }))
    await waitFor(() => {
      const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(body.audience).toBe('product managers')
    })
  })

  it('updates technical level via slider', () => {
    render(<VoiceSettingsForm {...defaultProps} />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '3' } })
    expect(screen.getByText(/technical level: 3\/10/i)).toBeTruthy()
  })

  it('saves settings with correct payload', async () => {
    const user = userEvent.setup()
    render(<VoiceSettingsForm {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /save voice settings/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/voice',
        expect.objectContaining({ method: 'PUT' })
      )
      const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(body.tone).toBe('professional')
      expect(body.technicalLevel).toBe(7)
      expect(body.audience).toBe('developers')
    })
  })

  it('shows Saved! after successful save', async () => {
    const user = userEvent.setup()
    render(<VoiceSettingsForm {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /save voice settings/i }))
    await waitFor(() => expect(screen.getByText('Saved!')).toBeTruthy())
  })

  it('shows error when save fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const user = userEvent.setup()
    render(<VoiceSettingsForm {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /save voice settings/i }))
    await waitFor(() => expect(screen.getByText('Failed to save settings')).toBeTruthy())
  })

  it('disables save button while saving', async () => {
    let resolve: (v: unknown) => void
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolve = r }))
    const user = userEvent.setup()
    render(<VoiceSettingsForm {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /save voice settings/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled())
    resolve!({ ok: true, json: async () => ({}) })
  })
})
