import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { createOctokit } from '@/lib/github/client'
import { GET } from '@/app/api/github/repos/route'

const mockDbLimit = vi.fn()

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mockDbLimit }) }) }),
  },
}))
vi.mock('@/lib/github/client', () => ({
  createOctokit: vi.fn(),
}))

const mockAccount = { access_token: 'ghs_token', userId: 'user-1', provider: 'github' }

const mockGitHubRepos = [
  {
    id: 1,
    name: 'repo-one',
    full_name: 'user/repo-one',
    html_url: 'https://github.com/user/repo-one',
    default_branch: 'main',
    private: false,
    description: 'First repo',
    language: 'TypeScript',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 2,
    name: 'repo-two',
    full_name: 'user/repo-two',
    html_url: 'https://github.com/user/repo-two',
    default_branch: 'main',
    private: true,
    description: null,
    language: 'JavaScript',
    updated_at: '2024-01-10T00:00:00Z',
  },
]

const mockOctokit = {
  repos: {
    listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: mockGitHubRepos }),
  },
}

function makeRequest() {
  return new Request('http://localhost/api/github/repos')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDbLimit.mockResolvedValue([mockAccount])
  vi.mocked(createOctokit).mockReturnValue(mockOctokit as any)
  mockOctokit.repos.listForAuthenticatedUser.mockResolvedValue({ data: mockGitHubRepos })
})

describe('GET /api/github/repos', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 400 when no GitHub account connected', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockDbLimit.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/GitHub account/i)
  })

  it('returns repos from GitHub API', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.repos).toHaveLength(2)
  })

  it('maps GitHub repo fields correctly', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await GET()
    const data = await res.json()
    const repo = data.repos[0]
    expect(repo.githubRepoId).toBe('1')
    expect(repo.name).toBe('repo-one')
    expect(repo.fullName).toBe('user/repo-one')
    expect(repo.url).toBe('https://github.com/user/repo-one')
    expect(repo.isPrivate).toBe(false)
    expect(repo.language).toBe('TypeScript')
  })

  it('calls octokit with correct options', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await GET()
    expect(mockOctokit.repos.listForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'updated', type: 'owner' })
    )
  })

  it('creates octokit with account token', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await GET()
    expect(createOctokit).toHaveBeenCalledWith('ghs_token')
  })
})
