import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { createOctokit } from '@/lib/github/client'
import { GET } from '@/app/api/github/repos/route'

import { getGithubAccessToken } from '@/lib/db/queries/integrations'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/integrations', () => ({ getGithubAccessToken: vi.fn() }))
vi.mock('@/lib/github/client', () => ({
  createOctokit: vi.fn(),
}))


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

const iteratorCalls: unknown[][] = []
let pages: unknown[][] = []

const mockOctokit = {
  repos: {
    listForAuthenticatedUser: vi.fn(),
  },
  paginate: {
    iterator: vi.fn((...args: unknown[]) => {
      iteratorCalls.push(args)
      return (async function* () {
        for (const data of pages) yield { data }
      })()
    }),
  },
}

function makeRequest() {
  return new Request('http://localhost/api/github/repos')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getGithubAccessToken).mockResolvedValue('ghs_token')
  vi.mocked(createOctokit).mockReturnValue(mockOctokit as any)
  iteratorCalls.length = 0
  pages = [mockGitHubRepos]
})

describe('GET /api/github/repos', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 400 when no GitHub account connected', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(getGithubAccessToken).mockResolvedValue(null)
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

  it('pages through every repository the user can access, organisations included', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await GET()
    expect(iteratorCalls[0][0]).toBe(mockOctokit.repos.listForAuthenticatedUser)
    expect(iteratorCalls[0][1]).toEqual(
      expect.objectContaining({ affiliation: 'owner,collaborator,organization_member', sort: 'pushed', per_page: 100 }),
    )
  })

  it('reads every page and flags admin access and owner type', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', login: 'user' } } as any)
    pages = [
      [{ ...mockGitHubRepos[0], owner: { login: 'user', type: 'User' }, permissions: { admin: true, push: true } }],
      [{ ...mockGitHubRepos[1], id: 3, full_name: 'acme/api', owner: { login: 'acme', type: 'Organization' }, permissions: { admin: false, push: true } }],
    ]
    const data = await (await GET()).json()
    expect(data.repos).toHaveLength(2)
    const org = data.repos.find((r: any) => r.fullName === 'acme/api')
    expect(org).toMatchObject({ ownerType: 'org', personal: false, canAdmin: false, canPush: true })
    const own = data.repos.find((r: any) => r.fullName === 'user/repo-one')
    expect(own).toMatchObject({ ownerType: 'user', personal: true, canAdmin: true })
  })

  it('creates octokit with account token', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await GET()
    expect(createOctokit).toHaveBeenCalledWith('ghs_token')
  })
})
