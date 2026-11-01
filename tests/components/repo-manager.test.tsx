import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RepoManager, webhookHealth } from '@/components/repo-manager'
import { RepoConnect, filterGithubRepos, type GithubRepo } from '@/components/repo-connect'
import { jsonResponse } from './fixtures'

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() })
  return { toast, push: vi.fn(), refresh: vi.fn(), handlePlanError: vi.fn(), openUpgrade: vi.fn() }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: vi.fn() }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('@/components/billing/upgrade-provider', () => ({
  useUpgrade: () => ({ handlePlanError: mocks.handlePlanError, openUpgrade: mocks.openUpgrade }),
}))

const repo = {
  id: 'r1',
  name: 'commitflex',
  fullName: 'ritvik/commitflex',
  isPrivate: true,
  autoGenerate: false,
  webhookId: 99,
  autopilotEnabled: true,
  webhookEvents: ['push'],
  defaultBranch: 'main',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlePlanError.mockResolvedValue(true)
  global.fetch = vi.fn().mockResolvedValue(jsonResponse({ repo }))
})

describe('webhookHealth', () => {
  it('grades the webhook', () => {
    expect(webhookHealth({ webhookId: null, webhookEvents: ['push'] })).toBe('missing')
    expect(webhookHealth({ webhookId: 1, webhookEvents: ['push'] })).toBe('push_only')
    expect(webhookHealth({ webhookId: 1, webhookEvents: ['push', 'pull_request', 'release'] })).toBe('complete')
    expect(webhookHealth({ webhookId: 1 })).toBe('push_only')
  })
})

describe('RepoManager', () => {
  it('lists repositories with their webhook state', () => {
    render(<RepoManager repos={[repo]} />)
    expect(screen.getByText('ritvik/commitflex')).toBeTruthy()
    expect(screen.getByText('Private')).toBeTruthy()
    expect(screen.getByText(/Only hears pushes/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /update webhook/i })).toBeTruthy()
  })

  it('upgrades the webhook to pull requests and releases', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ repo: { ...repo, webhookEvents: ['push', 'pull_request', 'release'] } }),
    )
    render(<RepoManager repos={[repo]} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /update webhook/i }))
    await waitFor(() => expect(screen.getByText('Hears pushes, merged pull requests and releases')).toBeTruthy())
    expect(global.fetch).toHaveBeenCalledWith('/api/repos/r1/webhook', expect.objectContaining({ method: 'POST' }))
    expect(screen.queryByRole('button', { name: /update webhook/i })).toBeNull()
  })

  it('turns autopilot off for a repo', async () => {
    render(<RepoManager repos={[repo]} />)
    await userEvent.setup().click(screen.getByRole('switch', { name: /autopilot/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/repos/r1')
    expect(JSON.parse(init.body)).toEqual({ autopilotEnabled: false })
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Autopilot off for commitflex'))
  })

  it('rolls back and opens the upgrade dialog past the plan limit', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 'limit_reached' }, 402))
    render(<RepoManager repos={[{ ...repo, autopilotEnabled: false }]} />)
    const toggle = screen.getByRole('switch', { name: /autopilot/i })
    await userEvent.setup().click(toggle)
    await waitFor(() => expect(mocks.handlePlanError).toHaveBeenCalled())
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
  })

  it('confirms before disconnecting', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) } as Response)
    const user = userEvent.setup()
    render(<RepoManager repos={[repo]} emptyAction={<button type="button">Connect one</button>} />)
    await user.click(screen.getByRole('button', { name: /actions for ritvik\/commitflex/i }))
    await user.click(await screen.findByRole('menuitem', { name: /disconnect/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Drafts, queued posts and published posts stay/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /^disconnect$/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/repos/r1', { method: 'DELETE' }))
    await waitFor(() => expect(screen.getByText('No repositories yet')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Connect one' })).toBeTruthy()
  })
})

const githubRepos: GithubRepo[] = [
  {
    githubRepoId: '1',
    name: 'commitflex',
    fullName: 'ritvik/commitflex',
    url: 'https://github.com/ritvik/commitflex',
    defaultBranch: 'main',
    isPrivate: false,
    description: 'Commits to posts',
    language: 'TypeScript',
    updatedAt: '2026-11-01T00:00:00Z',
    stars: 12,
  },
  {
    githubRepoId: '2',
    name: 'dotfiles',
    fullName: 'ritvik/dotfiles',
    url: 'https://github.com/ritvik/dotfiles',
    defaultBranch: 'main',
    isPrivate: true,
    description: null,
    language: 'Shell',
    updatedAt: null,
  },
]

describe('RepoConnect', () => {
  it('filters by name, description and language', () => {
    expect(filterGithubRepos(githubRepos, 'shell').map((r) => r.name)).toEqual(['dotfiles'])
    expect(filterGithubRepos(githubRepos, 'posts').map((r) => r.name)).toEqual(['commitflex'])
    expect(filterGithubRepos(githubRepos, '  ')).toHaveLength(2)
  })

  it('lists repositories and connects one', async () => {
    const onConnected = vi.fn()
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url === '/api/github/repos'
          ? jsonResponse({ repos: githubRepos })
          : jsonResponse({ repo: { id: 'new-id', fullName: 'ritvik/dotfiles' } }, 201),
      ),
    )
    render(<RepoConnect connectedGithubIds={['1']} onConnected={onConnected} />)
    await waitFor(() => expect(screen.getByText('ritvik/dotfiles')).toBeTruthy())
    expect(screen.getByText('Connected')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Connect ritvik/dotfiles' }))
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith({ id: 'new-id', fullName: 'ritvik/dotfiles' }))
    expect(screen.getAllByText('Connected')).toHaveLength(2)
  })

  it('shows a retryable error when GitHub fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'No GitHub account connected' }, 400))
    render(<RepoConnect />)
    await waitFor(() => expect(screen.getByText('No GitHub account connected')).toBeTruthy())
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })
})
