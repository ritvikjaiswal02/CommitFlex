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
  getUserRepoByGithubId: vi.fn(),
  toClientRepo: (r: Record<string, unknown>) => {
    const { webhookSecret, ...rest } = r
    void webhookSecret
    return rest
  },
}))
vi.mock('@/lib/db/queries/integrations', () => ({ getGithubAccessToken: vi.fn() }))
vi.mock('@/lib/plans', () => ({
  assertWithinLimit: vi.fn(),
  planErrorToResponse: vi.fn((err: any) => (err?.name === 'PlanError' ? Response.json(err.body, { status: 402 }) : null)),
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
import { createOctokit } from '@/lib/github/client'
import { getUserRepos, createRepo, updateRepoWebhook, getUserRepoByGithubId } from '@/lib/db/queries/repos'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { assertWithinLimit } from '@/lib/plans'
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

const githubRepo = {
  id: 12345,
  name: 'my-repo',
  full_name: 'user/my-repo',
  html_url: 'https://github.com/user/my-repo',
  default_branch: 'main',
  private: false,
  owner: { login: 'user', type: 'User' },
  permissions: { admin: true, push: true },
}
const octokit = { request: vi.fn(), repos: { get: vi.fn() } }

beforeEach(() => {
  vi.clearAllMocks()
  octokit.request.mockResolvedValue({ data: githubRepo })
  vi.mocked(createOctokit).mockReturnValue(octokit as any)
  vi.mocked(getUserRepos).mockResolvedValue(mockRepos as any)
  vi.mocked(createRepo).mockResolvedValue({ id: 'new-repo', ...validCreateBody, userId: 'user-1' } as any)
  vi.mocked(updateRepoWebhook).mockImplementation(async (id: string, fields: any) => ({ id, ...validCreateBody, ...fields }) as any)
  vi.mocked(getUserRepoByGithubId).mockResolvedValue(null)
  vi.mocked(assertWithinLimit).mockResolvedValue({ used: 0, max: 10 } as any)
  vi.mocked(installRepoWebhook).mockResolvedValue(987)
  // Default: a GitHub token exists.
  vi.mocked(getGithubAccessToken).mockResolvedValue('ghs_xxx')
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

  it('reads the repository from GitHub instead of trusting the request body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(
      makePostRequest({ ...validCreateBody, fullName: 'victim/their-repo', url: 'https://github.com/victim/their-repo', defaultBranch: 'evil' }),
    )
    expect(res.status).toBe(201)
    expect(octokit.request).toHaveBeenCalledWith('GET /repositories/{id}', { id: 12345 })
    expect(createRepo).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'user/my-repo', url: 'https://github.com/user/my-repo', defaultBranch: 'main' }),
    )
  })

  it('refuses a repository the user cannot push to', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    octokit.request.mockResolvedValueOnce({ data: { ...githubRepo, permissions: { admin: false, push: false } } })
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('no_access')
    expect(createRepo).not.toHaveBeenCalled()
  })

  it('connects without a webhook (and says why) when the user is not an admin', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    octokit.request.mockResolvedValueOnce({ data: { ...githubRepo, permissions: { admin: false, push: true } } })
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.warning).toMatch(/admin access/)
    expect(installRepoWebhook).not.toHaveBeenCalled()
  })

  it('answers 404 when GitHub does not show the repository to this user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    octokit.request.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(404)
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

  it('asks to sign in again when no GitHub access token is on file', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(getGithubAccessToken).mockResolvedValue(null)
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(412)
    expect((await res.json()).code).toBe('no_github_token')
    expect(createRepo).not.toHaveBeenCalled()
  })

  it('subscribes the webhook to push, pull_request and release', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await POST(makePostRequest(validCreateBody))
    expect(updateRepoWebhook).toHaveBeenCalledWith('new-repo', expect.objectContaining({
      webhookEvents: ['push', 'pull_request', 'release'],
    }))
  })

  it('returns 409 when the repo is already connected', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(getUserRepoByGithubId).mockResolvedValue({ id: 'r1', fullName: 'user/my-repo', webhookSecret: 's' } as any)
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.code).toBe('already_connected')
    expect(data.repo.webhookSecret).toBeUndefined()
    expect(createRepo).not.toHaveBeenCalled()
  })

  it('returns 402 when the plan repo limit is reached', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const body = { error: 'limit', code: 'limit_reached', limit: 'repos', used: 1, max: 1, requiredPlan: 'pro', currentPlan: 'free' }
    vi.mocked(assertWithinLimit).mockRejectedValue(Object.assign(new Error('limit'), { name: 'PlanError', status: 402, body }))
    const res = await POST(makePostRequest(validCreateBody))
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe('limit_reached')
    expect(createRepo).not.toHaveBeenCalled()
  })
})
