import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbStub } = vi.hoisted(() => ({
  dbStub: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/lib/db/client', () => ({ db: dbStub }))
vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => ({
  getUserRepos: vi.fn(),
  createRepo: vi.fn(),
  getRepo: vi.fn(),
  updateRepoWebhook: vi.fn(),
}))
vi.mock('@/lib/github/client', () => ({ createOctokit: vi.fn() }))
vi.mock('@/lib/github/webhook', async () => {
  const actual = await vi.importActual<typeof import('@/lib/github/webhook')>('@/lib/github/webhook')
  return {
    ...actual,
    installRepoWebhook: vi.fn(),
    generateWebhookSecret: vi.fn(() => 'a'.repeat(64)),
  }
})

import { auth } from '@/auth'
import { getUserRepos, createRepo, updateRepoWebhook } from '@/lib/db/queries/repos'
import { installRepoWebhook } from '@/lib/github/webhook'
import { GET, POST } from '@/app/api/repos/route'

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

function chainable(rows: any[]) {
  const o: any = {}
  o.from = () => o; o.where = () => o; o.limit = () => Promise.resolve(rows)
  o.then = (cb: any) => Promise.resolve(rows).then(cb)
  return o
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getUserRepos).mockResolvedValue(mockRepos as any)
  vi.mocked(createRepo).mockResolvedValue({ id: 'new-repo', ...validCreateBody, userId: 'user-1' } as any)
  vi.mocked(updateRepoWebhook).mockResolvedValue({ id: 'new-repo' } as any)
  vi.mocked(installRepoWebhook).mockResolvedValue(987)
  // Default accounts lookup: a token exists.
  dbStub.select.mockImplementation(() => chainable([{ userId: 'user-1', provider: 'github', access_token: 'ghs_xxx' }]))
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

  it('creates repo + installs webhook + returns 201 with autoGenerate=true on happy path', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.repo).toBeTruthy()
    expect(data.repo.autoGenerate).toBe(true)
    expect(data.repo.webhookId).toBe(987)
    expect(createRepo).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', fullName: 'user/my-repo' }))
    expect(installRepoWebhook).toHaveBeenCalled()
    expect(updateRepoWebhook).toHaveBeenCalledWith('new-repo', expect.objectContaining({
      webhookId: 987,
      autoGenerate: true,
    }))
  })

  it('still 201 with autoGenerate=false + warning when webhook install fails', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(installRepoWebhook).mockRejectedValue(new Error('scope denied'))
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.repo.autoGenerate).toBe(false)
    expect(data.warning).toContain('scope denied')
    expect(updateRepoWebhook).toHaveBeenLastCalledWith('new-repo', { autoGenerate: false })
  })

  it('falls back gracefully when no GitHub access token is on file', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    dbStub.select.mockImplementation(() => chainable([]))
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.repo.autoGenerate).toBe(false)
    expect(data.warning).toMatch(/Webhook install failed/)
  })
})
