import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { getUserRepos, createRepo } from '@/lib/db/queries/repos'
import { GET, POST } from '@/app/api/repos/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => ({
  getUserRepos: vi.fn(),
  createRepo: vi.fn(),
  getRepo: vi.fn(),
}))

const mockRepos = [
  { id: 'repo-1', fullName: 'user/repo-one', name: 'repo-one' },
  { id: 'repo-2', fullName: 'user/repo-two', name: 'repo-two' },
]

const validCreateBody = {
  githubRepoId: '12345',
  name: 'my-repo',
  fullName: 'user/my-repo',
  url: 'https://github.com/user/my-repo',
  defaultBranch: 'main',
  isPrivate: false,
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getUserRepos).mockResolvedValue(mockRepos as any)
  vi.mocked(createRepo).mockResolvedValue({ id: 'new-repo', ...validCreateBody, userId: 'user-1' } as any)
})

describe('GET /api/repos', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns user repos', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.repos).toHaveLength(2)
    expect(getUserRepos).toHaveBeenCalledWith('user-1')
  })
})

describe('POST /api/repos', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makePostRequest({ name: 'missing-fields' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid url', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makePostRequest({ ...validCreateBody, url: 'not-a-url' }))
    expect(res.status).toBe(400)
  })

  it('creates repo and returns 201', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.repo).toBeTruthy()
    expect(createRepo).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      fullName: 'user/my-repo',
    }))
  })
})
