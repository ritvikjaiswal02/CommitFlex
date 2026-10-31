import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ai/voice-analyzer', () => ({ analyzeVoiceSamples: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/lib/db/queries/voice', () => ({
  listVoiceProfiles: vi.fn(),
  createVoiceProfile: vi.fn(),
  getVoiceProfile: vi.fn(),
  updateVoiceProfile: vi.fn(),
  deleteVoiceProfile: vi.fn(),
  setDefaultProfile: vi.fn(),
}))
vi.mock('@/lib/plans', async () => {
  class PlanError extends Error {
    readonly status = 402 as const
    constructor(readonly body: Record<string, unknown>) {
      super(String(body.error))
      this.name = 'PlanError'
    }
  }
  return {
    PlanError,
    assertWithinLimit: vi.fn(),
    assertFeature: vi.fn(),
    planErrorToResponse: (err: unknown) =>
      err instanceof PlanError ? Response.json(err.body, { status: 402 }) : null,
  }
})

import { auth } from '@/auth'
import { analyzeVoiceSamples } from '@/lib/ai/voice-analyzer'
import { checkRateLimit } from '@/lib/rate-limit'
import * as plans from '@/lib/plans'
import {
  createVoiceProfile,
  deleteVoiceProfile,
  getVoiceProfile,
  listVoiceProfiles,
  setDefaultProfile,
  updateVoiceProfile,
} from '@/lib/db/queries/voice'
import { GET as listRoute, POST as createRoute } from '@/app/api/voice/profiles/route'
import { PATCH as patchRoute, DELETE as deleteRoute } from '@/app/api/voice/profiles/[profileId]/route'
import { POST as defaultRoute } from '@/app/api/voice/profiles/[profileId]/default/route'
import { POST as fingerprintRoute } from '@/app/api/voice/profiles/[profileId]/fingerprint/route'

const now = new Date('2026-11-01T00:00:00Z')
const row = (patch: Record<string, unknown> = {}) => ({
  id: 'p1',
  userId: 'u1',
  name: 'Default',
  isDefault: true,
  tone: 'analytical',
  technicalLevel: 8,
  audience: 'developers',
  extraContext: null,
  createdAt: now,
  updatedAt: now,
  ...patch,
})

const json = (method: string, body: unknown) =>
  new Request('http://localhost/api/voice/profiles', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const params = { params: { profileId: 'p1' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  vi.mocked(getVoiceProfile).mockResolvedValue(row() as any)
  vi.mocked(plans.assertWithinLimit).mockResolvedValue({ used: 0, max: 5 } as any)
  vi.mocked(plans.assertFeature).mockResolvedValue({} as any)
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 } as any)
})

describe('GET /api/voice/profiles', () => {
  it('returns serialized profiles', async () => {
    vi.mocked(listVoiceProfiles).mockResolvedValue([row()] as any)
    const data = await (await listRoute()).json()
    expect(data.profiles[0]).toMatchObject({ id: 'p1', name: 'Default', createdAt: now.toISOString() })
    expect(data.profiles[0].userId).toBeUndefined()
  })
})

describe('POST /api/voice/profiles', () => {
  const valid = { name: 'Founder voice', tone: 'enthusiastic', technicalLevel: 5, audience: 'founders' }

  it('returns 401 when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await createRoute(json('POST', valid))).status).toBe(401)
  })

  it('validates input', async () => {
    const res = await createRoute(json('POST', { ...valid, name: ' ' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_request')
  })

  it('returns 402 when the voiceProfiles limit is reached', async () => {
    vi.mocked(plans.assertWithinLimit).mockRejectedValue(
      new (plans as any).PlanError({
        error: 'Free includes 1 voice profile.',
        code: 'limit_reached',
        limit: 'voiceProfiles',
        used: 1,
        max: 1,
        requiredPlan: 'pro',
        currentPlan: 'free',
      }),
    )
    const res = await createRoute(json('POST', valid))
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe('limit_reached')
    expect(createVoiceProfile).not.toHaveBeenCalled()
  })

  it('creates the profile', async () => {
    vi.mocked(createVoiceProfile).mockResolvedValue(row({ id: 'p2', name: 'Founder voice', isDefault: false }) as any)
    const res = await createRoute(json('POST', valid))
    expect(res.status).toBe(201)
    expect(plans.assertWithinLimit).toHaveBeenCalledWith('u1', 'voiceProfiles')
    expect(createVoiceProfile).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'Founder voice', makeDefault: false }))
  })
})

describe('PATCH and DELETE /api/voice/profiles/:id', () => {
  it('returns 404 for a missing profile and 403 for someone else’s', async () => {
    vi.mocked(getVoiceProfile).mockResolvedValue(null)
    expect((await patchRoute(json('PATCH', { name: 'x' }), params)).status).toBe(404)
    vi.mocked(getVoiceProfile).mockResolvedValue(row({ userId: 'someone-else' }) as any)
    expect((await patchRoute(json('PATCH', { name: 'x' }), params)).status).toBe(403)
    expect((await deleteRoute(json('DELETE', {}), params)).status).toBe(403)
  })

  it('accepts long style notes', async () => {
    vi.mocked(updateVoiceProfile).mockResolvedValue(row({ extraContext: 'n'.repeat(3500) }) as any)
    const res = await patchRoute(json('PATCH', { extraContext: 'n'.repeat(3500) }), params)
    expect(res.status).toBe(200)
    expect((await patchRoute(json('PATCH', { extraContext: 'n'.repeat(4001) }), params)).status).toBe(400)
  })

  it('refuses to delete the last profile with 409', async () => {
    vi.mocked(deleteVoiceProfile).mockResolvedValue({ deleted: false, reason: 'last_profile' })
    const res = await deleteRoute(json('DELETE', {}), params)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('last_profile')
  })

  it('deletes with 204', async () => {
    vi.mocked(deleteVoiceProfile).mockResolvedValue({ deleted: true })
    expect((await deleteRoute(json('DELETE', {}), params)).status).toBe(204)
  })
})

describe('POST /api/voice/profiles/:id/default', () => {
  it('sets the default for an owned profile', async () => {
    vi.mocked(setDefaultProfile).mockResolvedValue(row() as any)
    const res = await defaultRoute(json('POST', {}), params)
    expect(res.status).toBe(200)
    expect(setDefaultProfile).toHaveBeenCalledWith('u1', 'p1')
  })
})

describe('POST /api/voice/profiles/:id/fingerprint', () => {
  const samples = { samples: ['x'.repeat(80), 'y'.repeat(90)] }

  it('validates samples before calling the model', async () => {
    const res = await fingerprintRoute(json('POST', { samples: ['short'] }), params)
    expect(res.status).toBe(400)
    expect(analyzeVoiceSamples).not.toHaveBeenCalled()
  })

  it('rate limits', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() } as any)
    expect((await fingerprintRoute(json('POST', samples), params)).status).toBe(429)
  })

  it('returns 502 when the model fails and saves nothing', async () => {
    vi.mocked(analyzeVoiceSamples).mockRejectedValue(new Error('timeout'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await fingerprintRoute(json('POST', samples), params)
    expect(res.status).toBe(502)
    expect(updateVoiceProfile).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('analyses and stores the fingerprint as style notes', async () => {
    vi.mocked(analyzeVoiceSamples).mockResolvedValue({ fingerprint: 'Voice fingerprint: terse.' } as any)
    vi.mocked(updateVoiceProfile).mockResolvedValue(row({ extraContext: 'Voice fingerprint: terse.' }) as any)
    const res = await fingerprintRoute(json('POST', samples), params)
    expect(res.status).toBe(200)
    expect(updateVoiceProfile).toHaveBeenCalledWith('p1', { extraContext: 'Voice fingerprint: terse.' })
    const data = await res.json()
    expect(data.profile.extraContext).toBe('Voice fingerprint: terse.')
  })
})
