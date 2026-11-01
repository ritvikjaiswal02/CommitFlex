import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/jobs', () => ({ getUserJobs: vi.fn() }))
vi.mock('@/lib/db/queries/voice', () => ({ getVoiceProfile: vi.fn() }))
vi.mock('@/lib/pipeline/start', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pipeline/start')>('@/lib/pipeline/start')
  return { startGenerationJob: vi.fn(), startJobErrorResponse: actual.startJobErrorResponse }
})
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(() => Response.json({ error: 'Too many requests.', code: 'rate_limited' }, { status: 429 })),
}))

import { auth } from '@/auth'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { getVoiceProfile } from '@/lib/db/queries/voice'
import { startGenerationJob } from '@/lib/pipeline/start'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST, GET } from '@/app/api/generate/route'

const REPO_UUID = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890'
const VOICE_UUID = 'c1b2c3d4-e5f6-4890-abcd-ef1234567890'
const JOB_ID = 'b2c3d4e5-f6a7-4901-bcde-f12345678901'
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
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 })
  vi.mocked(startGenerationJob).mockResolvedValue({ ok: true, jobId: JOB_ID })
})

describe('POST /api/generate', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('unauthorized')
  })

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 3600_000 })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(429)
  })

  it('returns 400 invalid_request for an invalid body', async () => {
    const res = await POST(makeRequest({ repoId: 123 }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_request')
  })

  it('starts a manual window job and returns 202', async () => {
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(202)
    expect((await res.json()).jobId).toBe(JOB_ID)
    expect(startGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        repoId: REPO_UUID,
        trigger: 'manual',
        autoQueue: false,
        source: expect.objectContaining({ type: 'window' }),
      }),
    )
  })

  it('maps PR and release sources', async () => {
    await POST(makeRequest({ source: 'pr', repoId: REPO_UUID, prUrl: 'https://github.com/a/b/pull/3' }))
    expect(startGenerationJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: { type: 'pr', ref: 'https://github.com/a/b/pull/3' } }),
    )
    await POST(makeRequest({ source: 'release', repoId: REPO_UUID, releaseTag: 'v1.2.0' }))
    expect(startGenerationJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: { type: 'release', ref: 'v1.2.0' } }),
    )
  })

  it('returns 404 for a voice profile the user does not own', async () => {
    vi.mocked(getVoiceProfile).mockResolvedValue({ id: VOICE_UUID, userId: 'someone-else' } as any)
    const res = await POST(makeRequest({ ...validBody, voiceProfileId: VOICE_UUID }))
    expect(res.status).toBe(404)
    expect(startGenerationJob).not.toHaveBeenCalled()
  })

  it('passes an owned voice profile through', async () => {
    vi.mocked(getVoiceProfile).mockResolvedValue({ id: VOICE_UUID, userId: 'user-1' } as any)
    await POST(makeRequest({ ...validBody, voiceProfileId: VOICE_UUID }))
    expect(startGenerationJob).toHaveBeenCalledWith(expect.objectContaining({ voiceProfileId: VOICE_UUID }))
  })

  it('returns 409 active_job with the running job id', async () => {
    vi.mocked(startGenerationJob).mockResolvedValue({
      ok: false, status: 409, code: 'active_job', error: 'busy', jobId: 'running',
    })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data).toMatchObject({ code: 'active_job', jobId: 'running' })
  })

  it('returns 412 no_github_token', async () => {
    vi.mocked(startGenerationJob).mockResolvedValue({ ok: false, status: 412, code: 'no_github_token', error: 'x' })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(412)
  })

  it('returns the plan error body on 402', async () => {
    const planError = {
      error: "You've used 10 of 10 drafts this month.",
      code: 'limit_reached' as const,
      limit: 'generationsPerMonth' as const,
      used: 10,
      max: 10,
      requiredPlan: 'pro' as const,
      currentPlan: 'free' as const,
    }
    vi.mocked(startGenerationJob).mockResolvedValue({ ok: false, status: 402, code: 'limit_reached', error: planError.error, planError })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual(planError)
  })
})

describe('GET /api/generate', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns jobs list for authenticated user', async () => {
    vi.mocked(getUserJobs).mockResolvedValue([{ id: JOB_ID }] as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.jobs).toHaveLength(1)
  })
})
