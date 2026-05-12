import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { hasActiveJob, createJob, getUserJobs } from '@/lib/db/queries/jobs'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { runPipeline } from '@/lib/pipeline/run'
import { POST, GET } from '@/app/api/generate/route'

const mockDbLimit = vi.fn()

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/jobs', () => ({
  hasActiveJob: vi.fn(),
  createJob: vi.fn(),
  getUserJobs: vi.fn(),
}))
vi.mock('@/lib/auth/require-owner', () => ({
  requireRepoOwner: vi.fn(),
  ownershipErrorToResponse: vi.fn().mockReturnValue(null),
}))
vi.mock('@/lib/db/client', () => ({
  // Plain arrow functions for chain so vi.resetAllMocks() doesn't clear them
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mockDbLimit }) }) }),
  },
}))
vi.mock('@/lib/pipeline/run', () => ({ runPipeline: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 4, resetAt: 0 }),
  rateLimitResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429 })
  ),
}))

const REPO_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const mockAccount = { access_token: 'ghs_faketoken', userId: 'user-1', provider: 'github' }
const mockRepo = { id: REPO_UUID, userId: 'user-1', fullName: 'user/repo', url: null }
const mockJob = { id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', userId: 'user-1', repoId: REPO_UUID, status: 'queued' }
const validBody = { repoId: REPO_UUID, windowStart: '2024-01-01', windowEnd: '2024-01-31' }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Re-apply default implementations after clearAllMocks
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 4, resetAt: 0 })
  vi.mocked(rateLimitResponse).mockReturnValue(
    new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429 })
  )
  vi.mocked(ownershipErrorToResponse).mockReturnValue(null)
  vi.mocked(runPipeline).mockResolvedValue(undefined)
  mockDbLimit.mockResolvedValue([])
})

describe('POST /api/generate', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 3600_000 })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(429)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makeRequest({ repoId: 123 }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when active job already running', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(requireRepoOwner).mockResolvedValue(mockRepo as any)
    vi.mocked(hasActiveJob).mockResolvedValue(true)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(409)
  })

  it('returns 400 when no GitHub account connected', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(requireRepoOwner).mockResolvedValue(mockRepo as any)
    vi.mocked(hasActiveJob).mockResolvedValue(false)
    // mockDbLimit already returns [] by default (no account)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/GitHub account/i)
  })

  it('returns 202 with jobId when all checks pass', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(requireRepoOwner).mockResolvedValue(mockRepo as any)
    vi.mocked(hasActiveJob).mockResolvedValue(false)
    vi.mocked(createJob).mockResolvedValue(mockJob as any)
    mockDbLimit.mockResolvedValue([mockAccount])
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(202)
    const data = await res.json()
    expect(data.jobId).toBe('b2c3d4e5-f6a7-8901-bcde-f12345678901')
  })
})

describe('GET /api/generate', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns jobs list for authenticated user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(getUserJobs).mockResolvedValue([mockJob] as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.jobs).toHaveLength(1)
    expect(data.jobs[0].id).toBe('b2c3d4e5-f6a7-8901-bcde-f12345678901')
  })
})
