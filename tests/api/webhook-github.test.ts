import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

const { dbStub } = vi.hoisted(() => ({
  dbStub: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/lib/db/client', () => ({ db: dbStub }))
vi.mock('@/lib/db/queries/repos', () => ({ getRepoByGithubRepoId: vi.fn() }))
vi.mock('@/lib/db/queries/jobs', () => ({ createJob: vi.fn(), hasActiveJob: vi.fn() }))
vi.mock('@/lib/pipeline/run', () => ({ runPipeline: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { getRepoByGithubRepoId } from '@/lib/db/queries/repos'
import { createJob, hasActiveJob } from '@/lib/db/queries/jobs'
import { runPipeline } from '@/lib/pipeline/run'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from '@/app/api/webhooks/github/route'

const SECRET = 'd5b1e9a83b9b4a23a4ce3d4d5e6f78b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f6'

const baseRepo = {
  id: 'repo-uuid-1',
  userId: 'user-1',
  githubRepoId: 12345,
  name: 'widget',
  fullName: 'acme/widget',
  url: 'https://github.com/acme/widget',
  defaultBranch: 'main',
  webhookSecret: SECRET,
  webhookId: 99,
  autoGenerate: true,
}

function signed(body: string, secret = SECRET) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

function pushPayload(ref = 'refs/heads/main', repoId = 12345) {
  return JSON.stringify({
    ref,
    repository: { id: repoId, full_name: 'acme/widget', default_branch: 'main' },
    head_commit: { id: 'abc123', message: 'feat: ship it', timestamp: '2026-05-13T00:00:00Z' },
    commits: [{ id: 'abc123', message: 'feat: ship it', timestamp: '2026-05-13T00:00:00Z' }],
  })
}

function makeReq(body: string, headers: Record<string, string>) {
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers,
    body,
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
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 } as any)
  vi.mocked(getRepoByGithubRepoId).mockResolvedValue(baseRepo as any)
  vi.mocked(hasActiveJob).mockResolvedValue(false)
  vi.mocked(createJob).mockResolvedValue({ id: 'job-1', userId: 'user-1', repoId: 'repo-uuid-1', windowStart: new Date(), windowEnd: new Date() } as any)
  // Stub the accounts lookup
  dbStub.select.mockImplementation(() =>
    chainable([{ userId: 'user-1', provider: 'github', access_token: 'ghs_xxx' }])
  )
})

describe('POST /api/webhooks/github', () => {
  it('200s on ping events without auth', async () => {
    const res = await POST(makeReq('{}', { 'x-github-event': 'ping' }))
    expect(res.status).toBe(200)
  })

  it('200s and ignores non-push events', async () => {
    const res = await POST(makeReq('{}', { 'x-github-event': 'star' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ignored).toBe('star')
  })

  it('returns 400 on invalid JSON', async () => {
    const res = await POST(makeReq('not json', { 'x-github-event': 'push' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 ignored when the repo is not connected', async () => {
    vi.mocked(getRepoByGithubRepoId).mockResolvedValue(null as any)
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ignored).toBe('repo_not_connected')
  })

  it('returns 401 when signature is missing', async () => {
    const body = pushPayload()
    const res = await POST(makeReq(body, { 'x-github-event': 'push' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when signature is wrong', async () => {
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body, 'wrong-secret'),
    }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when repo has no webhookSecret', async () => {
    vi.mocked(getRepoByGithubRepoId).mockResolvedValue({ ...baseRepo, webhookSecret: null } as any)
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 } as any)
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(429)
  })

  it('ignores pushes to non-default branches', async () => {
    const body = pushPayload('refs/heads/feature-x')
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ignored).toBe('non_default_branch')
    expect(createJob).not.toHaveBeenCalled()
  })

  it('ignores when autoGenerate is disabled', async () => {
    vi.mocked(getRepoByGithubRepoId).mockResolvedValue({ ...baseRepo, autoGenerate: false } as any)
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ignored).toBe('auto_generate_disabled')
    expect(createJob).not.toHaveBeenCalled()
  })

  it('ignores when a job is already active', async () => {
    vi.mocked(hasActiveJob).mockResolvedValue(true)
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ignored).toBe('active_job')
    expect(createJob).not.toHaveBeenCalled()
  })

  it('returns 412 when owner has no GitHub access token', async () => {
    dbStub.select.mockImplementation(() => chainable([]))
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(412)
  })

  it('creates a job and fires the pipeline on a valid push (202)', async () => {
    const body = pushPayload()
    const res = await POST(makeReq(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signed(body),
    }))
    expect(res.status).toBe(202)
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      repoId: 'repo-uuid-1',
    }))
    expect(runPipeline).toHaveBeenCalled()
    const data = await res.json()
    expect(data.jobId).toBe('job-1')
  })
})
