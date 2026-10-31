import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GenerateForm, repoFromPrInput } from '@/components/generate-form'
import { jsonResponse } from './fixtures'

const mocks = vi.hoisted(() => ({ push: vi.fn(), handlePlanError: vi.fn(), openUpgrade: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/components/billing/upgrade-provider', () => ({
  useUpgrade: () => ({ handlePlanError: mocks.handlePlanError, openUpgrade: mocks.openUpgrade }),
}))

const repos = [
  { id: 'repo-uuid-1', name: 'my-app', fullName: 'user/my-app' },
  { id: 'repo-uuid-2', name: 'api', fullName: 'user/api' },
]

function generateCalls() {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/generate')
}

function lastBody() {
  const calls = generateCalls()
  return JSON.parse(calls[calls.length - 1][1].body)
}

const ACTIVITY = {
  pullRequests: [
    { number: 12, title: 'Voice profiles', url: 'https://github.com/user/my-app/pull/12', mergedAt: '2026-10-30T10:00:00Z', additions: 480, deletions: 31, drafted: true },
    { number: 11, title: 'Retry webhook deliveries', url: 'https://github.com/user/my-app/pull/11', mergedAt: '2026-10-29T10:00:00Z', additions: 120, deletions: 4, drafted: false },
  ],
  releases: [
    { tag: 'v2.0.0', name: 'Two', publishedAt: '2026-10-30T10:00:00Z', prerelease: false, kind: 'release', drafted: false },
    { tag: 'v1.9.0', name: null, publishedAt: '2026-10-01T10:00:00Z', prerelease: false, kind: 'release', drafted: true },
  ],
}

/** Activity for the pickers, 202 + jobId for /api/generate. */
function routedFetch() {
  return vi.fn(async (url: string) =>
    String(url).includes('/activity') ? jsonResponse(ACTIVITY, 200) : jsonResponse({ jobId: 'job-uuid-abc' }, 202),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.handlePlanError.mockResolvedValue(true)
  global.fetch = routedFetch() as unknown as typeof fetch
})

describe('repoFromPrInput', () => {
  it('reads owner/repo from links and short refs', () => {
    expect(repoFromPrInput('https://github.com/user/api/pull/12')).toBe('user/api')
    expect(repoFromPrInput('user/my-app#4')).toBe('user/my-app')
    expect(repoFromPrInput('not a pr')).toBeNull()
  })
})

describe('GenerateForm', () => {
  it('shows the selected repository', () => {
    render(<GenerateForm repos={repos} />)
    expect(screen.getByRole('combobox').textContent).toContain('user/my-app')
  })

  it('renders the generate button', () => {
    render(<GenerateForm repos={repos} />)
    expect(screen.getByRole('button', { name: /write drafts/i })).toBeTruthy()
  })

  it('disables the button without repositories', () => {
    render(<GenerateForm repos={[]} />)
    expect(screen.getByRole('button', { name: /write drafts/i })).toBeDisabled()
  })

  it('submits a 7-day window and opens the run', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(generateCalls()).toHaveLength(1))
    const body = lastBody()
    expect(body.repoId).toBe('repo-uuid-1')
    expect(body.windowStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.windowEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(body.windowEnd).getTime() - new Date(body.windowStart).getTime()).toBe(7 * 86_400_000)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/jobs/job-uuid-abc'))
  })

  it('uses the repository passed in the URL', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} defaultRepoId="repo-uuid-2" />)
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(generateCalls().length).toBeGreaterThan(0))
    expect(lastBody().repoId).toBe('repo-uuid-2')
  })

  it('sends the chosen voice profile', async () => {
    const user = userEvent.setup()
    render(
      <GenerateForm
        repos={repos}
        voiceProfiles={[
          { id: 'voice-1', name: 'Default', isDefault: false },
          { id: 'voice-2', name: 'Launch voice', isDefault: true },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(generateCalls().length).toBeGreaterThan(0))
    expect(lastBody().voiceProfileId).toBe('voice-2')
  })

  it('shows the API error message', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Rate limit exceeded' }, 429))
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(screen.getByText('Rate limit exceeded')).toBeTruthy())
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('links to the run already in progress', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Busy', code: 'active_job', jobId: 'job-running' }, 409))
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(screen.getByRole('link', { name: /open the run in progress/i })).toBeTruthy())
    expect(screen.getByRole('link', { name: /open the run in progress/i }).getAttribute('href')).toBe('/jobs/job-running')
  })

  it('hands plan limits to the upgrade dialog', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 'limit_reached' }, 402))
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(mocks.handlePlanError).toHaveBeenCalled())
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('shows a loading state while submitting', async () => {
    let resolve: (v: Response) => void = () => {}
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled())
    resolve(jsonResponse({ jobId: 'x' }, 202))
  })

  it('preselects the newest merged pull request without drafts, so one click writes them', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Pull request' }))
    const row = await screen.findByRole('radio', { name: /#11 Retry webhook deliveries/ })
    await waitFor(() => expect(row.getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByText(/\+480 \u2212 ?31|\+480/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(generateCalls()).toHaveLength(1))
    expect(lastBody()).toEqual({ source: 'pr', repoId: 'repo-uuid-1', prUrl: 'https://github.com/user/my-app/pull/11' })
  })

  it('submits a pasted pull request and switches to its repository', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Pull request' }))
    await user.click(await screen.findByRole('button', { name: 'Paste a link instead' }))
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'), {
      target: { value: 'https://github.com/user/api/pull/7' },
    })
    expect(screen.getByText('From user/api.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(generateCalls().length).toBeGreaterThan(0))
    expect(lastBody()).toEqual({ source: 'pr', repoId: 'repo-uuid-2', prUrl: 'https://github.com/user/api/pull/7' })
  })

  it('refuses a pull request from a repository that is not connected', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} defaultPrUrl="someone/else#3" />)
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    expect(screen.getByText("someone/else isn't connected. Add it in Repositories first.")).toBeTruthy()
    expect(generateCalls()).toHaveLength(0)
  })

  it('defaults to the newest release', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Release' }))
    await screen.findByRole('button', { name: 'Type a tag instead' })
    await waitFor(() => expect(screen.getByRole('combobox', { name: /release/i }).textContent).toContain('v2.0.0'))
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(generateCalls()).toHaveLength(1))
    expect(lastBody()).toEqual({ source: 'release', repoId: 'repo-uuid-1', releaseTag: 'v2.0.0' })
  })

  it('requires a release when typing a tag', async () => {
    const user = userEvent.setup()
    render(<GenerateForm repos={repos} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Release' }))
    await user.click(await screen.findByRole('button', { name: 'Type a tag instead' }))
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    expect(screen.getByText('Pick a release to write about.')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('v1.4.0'), { target: { value: 'v2.0.0' } })
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    await waitFor(() => expect(generateCalls().length).toBeGreaterThan(0))
    expect(lastBody()).toEqual({ source: 'release', repoId: 'repo-uuid-1', releaseTag: 'v2.0.0' })
  })

  it('validates a custom range', async () => {
    const user = userEvent.setup()
    const { container } = render(<GenerateForm repos={repos} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const [from, to] = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[]
    fireEvent.change(from, { target: { value: '2026-10-10' } })
    fireEvent.change(to, { target: { value: '2026-10-10' } })
    await user.click(screen.getByRole('button', { name: /write drafts/i }))
    expect(screen.getByText('Pick an end date after the start date.')).toBeTruthy()
    expect(generateCalls()).toHaveLength(0)
  })
})
