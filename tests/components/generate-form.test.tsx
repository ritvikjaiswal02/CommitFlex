import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GenerateForm } from '@/components/generate-form'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockRepos = [
  { id: 'repo-uuid-1', name: 'my-app', fullName: 'user/my-app' },
  { id: 'repo-uuid-2', name: 'api', fullName: 'user/api' },
]

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobId: 'job-uuid-abc' }),
  })
})

describe('GenerateForm', () => {
  it('renders repository options', () => {
    render(<GenerateForm repos={mockRepos} />)
    expect(screen.getByText('user/my-app')).toBeTruthy()
    expect(screen.getByText('user/api')).toBeTruthy()
  })

  it('renders generate button', () => {
    render(<GenerateForm repos={mockRepos} />)
    expect(screen.getByRole('button', { name: /generate posts/i })).toBeTruthy()
  })

  it('disables button when no repos', () => {
    render(<GenerateForm repos={[]} />)
    expect(screen.getByRole('button', { name: /generate posts/i })).toBeDisabled()
  })

  it('submits with correct payload and redirects on success', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={mockRepos} />)
    await user.click(screen.getByRole('button', { name: /generate posts/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/generate')
    const body = JSON.parse(opts.body)
    expect(body.repoId).toBe('repo-uuid-1')
    expect(body.windowStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.windowEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/jobs/job-uuid-abc'))
  })

  it('shows error message when API returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Rate limit exceeded' }),
    })
    const user = userEvent.setup()
    render(<GenerateForm repos={mockRepos} />)
    await user.click(screen.getByRole('button', { name: /generate posts/i }))
    await waitFor(() => expect(screen.getByText('Rate limit exceeded')).toBeTruthy())
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows loading state while submitting', async () => {
    let resolve: (v: unknown) => void
    global.fetch = vi.fn().mockReturnValue(
      new Promise(r => { resolve = r })
    )
    const user = userEvent.setup()
    render(<GenerateForm repos={mockRepos} />)
    await user.click(screen.getByRole('button', { name: /generate posts/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled())
    // Resolve to clean up
    resolve!({ ok: true, json: async () => ({ jobId: 'x' }) })
  })

  it('allows selecting a different repo', () => {
    render(<GenerateForm repos={mockRepos} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'repo-uuid-2' } })
    expect((select as HTMLSelectElement).value).toBe('repo-uuid-2')
  })

  it('sends the selected repo id', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={mockRepos} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'repo-uuid-2' } })
    await user.click(screen.getByRole('button', { name: /generate posts/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.repoId).toBe('repo-uuid-2')
  })
})
