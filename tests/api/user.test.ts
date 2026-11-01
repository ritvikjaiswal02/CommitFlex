import { describe, it, expect, vi, beforeEach } from 'vitest'

const mock = vi.hoisted(() => {
  const results: unknown[] = []
  const calls: { method: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'from', 'where', 'limit', 'delete']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    const next = results.shift()
    return next instanceof Error ? Promise.reject(next).then(resolve, reject) : Promise.resolve(next ?? []).then(resolve, reject)
  }
  return { results, calls, db: chain }
})

vi.mock('@/lib/db/client', () => ({ db: mock.db }))
vi.mock('@/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('@/lib/env', () => ({ isConfigured: vi.fn(() => true) }))
vi.mock('@/lib/plans', () => ({ getUserPlan: vi.fn() }))
vi.mock('@/lib/db/queries/billing', () => ({ getEntitledSubscription: vi.fn() }))
vi.mock('@/lib/billing/razorpay', () => ({ cancelSubscription: vi.fn() }))
vi.mock('@/lib/db/queries/onboarding', () => ({ getUserProfile: vi.fn(), upsertUserProfile: vi.fn() }))

import { auth, signOut } from '@/auth'
import { isConfigured } from '@/lib/env'
import { getUserPlan } from '@/lib/plans'
import { getEntitledSubscription } from '@/lib/db/queries/billing'
import { cancelSubscription } from '@/lib/billing/razorpay'
import { getUserProfile, upsertUserProfile } from '@/lib/db/queries/onboarding'
import { DELETE, GET } from '@/app/api/user/route'
import { PATCH } from '@/app/api/user/profile/route'

beforeEach(() => {
  vi.clearAllMocks()
  mock.results.length = 0
  mock.calls.length = 0
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  vi.mocked(isConfigured).mockReturnValue(true)
  vi.mocked(getUserPlan).mockResolvedValue({ id: 'pro', status: 'trialing', trialEndsAt: new Date('2026-11-15T00:00:00Z') } as any)
  vi.mocked(getUserProfile).mockResolvedValue({ userId: 'u1', role: 'founder' } as any)
  vi.mocked(getEntitledSubscription).mockResolvedValue(null)
})

describe('GET /api/user', () => {
  it('returns 401 when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await GET()).status).toBe(401)
  })

  it('returns the user, profile and plan', async () => {
    mock.results.push([{ id: 'u1', name: 'Ada', email: 'ada@acme.dev', image: null }])
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.user.email).toBe('ada@acme.dev')
    expect(data.profile.role).toBe('founder')
    expect(data.plan).toEqual({ id: 'pro', status: 'trialing', trialEndsAt: '2026-11-15T00:00:00.000Z' })
  })

  it('returns 404 when the user row is gone', async () => {
    mock.results.push([])
    expect((await GET()).status).toBe(404)
  })
})

describe('DELETE /api/user', () => {
  it('returns 401 when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await DELETE()).status).toBe(401)
  })

  it('cancels a live subscription immediately, then deletes the user', async () => {
    vi.mocked(getEntitledSubscription).mockResolvedValue({ razorpaySubscriptionId: 'sub_123', status: 'active' } as any)
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(cancelSubscription).toHaveBeenCalledWith('sub_123', { atCycleEnd: false })
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(true)
    expect(signOut).toHaveBeenCalledWith({ redirect: false })
  })

  it('still deletes when Razorpay fails', async () => {
    vi.mocked(getEntitledSubscription).mockResolvedValue({ razorpaySubscriptionId: 'sub_123', status: 'active' } as any)
    vi.mocked(cancelSubscription).mockRejectedValue(new Error('razorpay down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(true)
    spy.mockRestore()
  })

  it('skips Razorpay when it is not configured or already cancelled', async () => {
    vi.mocked(isConfigured).mockReturnValue(false)
    await DELETE()
    expect(getEntitledSubscription).not.toHaveBeenCalled()

    vi.mocked(isConfigured).mockReturnValue(true)
    vi.mocked(getEntitledSubscription).mockResolvedValue({ razorpaySubscriptionId: 'sub_1', status: 'cancelled' } as any)
    await DELETE()
    expect(cancelSubscription).not.toHaveBeenCalled()
  })

  it('returns 500 and keeps the account when the delete fails', async () => {
    mock.results.push(new Error('fk violation'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(signOut).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('PATCH /api/user/profile', () => {
  const req = (body: unknown) =>
    new Request('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 401 when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await PATCH(req({ role: 'founder' }))).status).toBe(401)
  })

  it('validates input', async () => {
    expect((await PATCH(req({ timezone: 'Nope/Nowhere' }))).status).toBe(400)
    expect((await PATCH(req({ platforms: [] }))).status).toBe(400)
    expect((await PATCH(req({ onboardedAt: null }))).status).toBe(400)
  })

  it('saves the allowed fields and clears nulls', async () => {
    vi.mocked(upsertUserProfile).mockResolvedValue({ userId: 'u1', role: null } as any)
    const res = await PATCH(req({ role: null, pitch: '', audiences: ['developers'], timezone: 'Europe/London' }))
    expect(res.status).toBe(200)
    expect(upsertUserProfile).toHaveBeenCalledWith('u1', {
      role: null,
      pitch: null,
      audiences: ['developers'],
      timezone: 'Europe/London',
    })
  })
})
