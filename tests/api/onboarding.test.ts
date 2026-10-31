import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/env', () => ({ isConfigured: vi.fn(() => false), appUrl: () => 'https://app.test' }))
vi.mock('@/lib/plans', () => ({ getUserPlan: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => ({ getUserRepos: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({
  getAutopilotSettings: vi.fn(),
  upsertAutopilotSettings: vi.fn(),
}))
vi.mock('@/lib/db/queries/integrations', () => ({ getLinkedInConnectionSummary: vi.fn() }))
vi.mock('@/lib/db/queries/onboarding', () => ({
  getUserProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
  startTrialIfEligible: vi.fn(),
}))

import { auth } from '@/auth'
import { isConfigured } from '@/lib/env'
import { getUserPlan } from '@/lib/plans'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getAutopilotSettings, upsertAutopilotSettings } from '@/lib/db/queries/autopilot'
import { getLinkedInConnectionSummary } from '@/lib/db/queries/integrations'
import { getUserProfile, startTrialIfEligible, upsertUserProfile } from '@/lib/db/queries/onboarding'
import { GET, PATCH } from '@/app/api/onboarding/route'

const baseProfile = {
  userId: 'u1',
  role: null,
  pitch: null,
  audiences: [],
  platforms: ['linkedin', 'twitter'],
  tonePreset: null,
  timezone: 'UTC',
  country: null,
  onboardingStep: 'repos',
  onboardedAt: null,
  trialEndsAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
}

const autopilot = {
  enabled: false,
  cadence: 'ship_moments',
  postDays: [2, 4],
  postTime: '09:00',
  triggers: ['pr_merged', 'release_published', 'weekly_digest'],
  platforms: ['linkedin', 'twitter'],
  approvalMode: 'review',
  reviewerEmails: [],
  defaultVoiceProfileId: null,
  pausedUntil: null,
  timezone: 'UTC',
}

function plan(id: 'free' | 'pro' | 'team', status = id === 'free' ? 'free' : 'trialing') {
  return { id, status, trialEndsAt: status === 'trialing' ? new Date('2026-11-15T00:00:00Z') : null }
}

function patch(body: unknown) {
  return new Request('http://localhost/api/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as any)
  vi.mocked(getUserProfile).mockResolvedValue(baseProfile as any)
  vi.mocked(upsertUserProfile).mockImplementation(async (_id, p) => ({ ...baseProfile, ...p }) as any)
  vi.mocked(startTrialIfEligible).mockResolvedValue(null)
  vi.mocked(getAutopilotSettings).mockResolvedValue(autopilot as any)
  vi.mocked(upsertAutopilotSettings).mockResolvedValue(autopilot as any)
  vi.mocked(getUserRepos).mockResolvedValue([{ id: 'r1', fullName: 'acme/api' }] as any)
  vi.mocked(getLinkedInConnectionSummary).mockResolvedValue(null)
  vi.mocked(getUserPlan).mockResolvedValue(plan('pro') as any)
})

describe('GET /api/onboarding', () => {
  it('returns 401 when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET(new Request('http://localhost/api/onboarding'))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('unauthorized')
  })

  it('creates the profile with the browser time zone and starts the trial', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(null)
    const trialEnd = new Date('2026-11-15T00:00:00Z')
    vi.mocked(startTrialIfEligible).mockResolvedValue(trialEnd)

    const res = await GET(
      new Request('http://localhost/api/onboarding?tz=Asia%2FKolkata', { headers: { 'x-vercel-ip-country': 'IN' } }),
    )
    expect(res.status).toBe(200)
    expect(upsertUserProfile).toHaveBeenCalledWith('u1', { timezone: 'Asia/Kolkata', country: 'IN' })
    expect(startTrialIfEligible).toHaveBeenCalledWith('u1')
    const data = await res.json()
    expect(data.profile.trialEndsAt).toBe(trialEnd.toISOString())
    expect(data.repos).toEqual([{ id: 'r1', fullName: 'acme/api' }])
    expect(data.linkedinAvailable).toBe(false)
    expect(data.plan).toEqual({ id: 'pro', status: 'trialing', trialEndsAt: '2026-11-15T00:00:00.000Z' })
  })

  it('ignores an invalid tz and falls back to UTC', async () => {
    vi.mocked(getUserProfile).mockResolvedValue(null)
    await GET(new Request('http://localhost/api/onboarding?tz=Not%2FAZone'))
    expect(upsertUserProfile).toHaveBeenCalledWith('u1', { timezone: 'UTC', country: null })
  })

  it('updates a default UTC zone before onboarding finishes', async () => {
    await GET(new Request('http://localhost/api/onboarding?tz=Europe%2FBerlin'))
    expect(upsertUserProfile).toHaveBeenCalledWith('u1', { timezone: 'Europe/Berlin' })
  })

  it('does not touch the zone of an onboarded user', async () => {
    vi.mocked(getUserProfile).mockResolvedValue({ ...baseProfile, onboardedAt: new Date() } as any)
    await GET(new Request('http://localhost/api/onboarding?tz=Europe%2FBerlin'))
    expect(upsertUserProfile).not.toHaveBeenCalled()
  })

  it('reports LinkedIn availability and survives a failing summary', async () => {
    vi.mocked(isConfigured).mockReturnValue(true)
    vi.mocked(getLinkedInConnectionSummary).mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(new Request('http://localhost/api/onboarding'))
    const data = await res.json()
    expect(data.linkedinAvailable).toBe(true)
    expect(data.linkedin).toBeNull()
    spy.mockRestore()
  })

  it('returns 500 with a useful message when the database fails', async () => {
    vi.mocked(getUserProfile).mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(new Request('http://localhost/api/onboarding'))
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('internal_error')
    spy.mockRestore()
  })
})

describe('PATCH /api/onboarding', () => {
  it('returns 401 when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await PATCH(patch({ step: 'role' }))).status).toBe(401)
  })

  it('rejects invalid values with issues', async () => {
    const res = await PATCH(patch({ role: 'wizard' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('invalid_request')
    expect(data.issues).toBeTruthy()
  })

  it('rejects more than two audiences', async () => {
    expect((await PATCH(patch({ audiences: ['developers', 'users', 'founders'] }))).status).toBe(400)
  })

  it('saves profile answers and the step', async () => {
    const res = await PATCH(patch({ step: 'audience', role: 'founder', pitch: '  A CLI  ' }))
    expect(res.status).toBe(200)
    expect(upsertUserProfile).toHaveBeenCalledWith('u1', { onboardingStep: 'audience', role: 'founder', pitch: 'A CLI' })
    expect(upsertAutopilotSettings).not.toHaveBeenCalled()
  })

  it('clears an empty pitch', async () => {
    await PATCH(patch({ pitch: '' }))
    expect(upsertUserProfile).toHaveBeenCalledWith('u1', { pitch: null })
  })

  it('writes cadence answers to autopilot settings without enabling it', async () => {
    await PATCH(patch({ cadence: 'three_weekly', postTime: '18:00', approvalMode: 'auto' }))
    expect(upsertAutopilotSettings).toHaveBeenCalledWith('u1', {
      cadence: 'three_weekly',
      postDays: [1, 3, 5],
      postTime: '18:00',
      approvalMode: 'auto',
    })
  })

  it('downgrades locked choices on the Free plan', async () => {
    vi.mocked(getUserPlan).mockResolvedValue(plan('free') as any)
    await PATCH(patch({ cadence: 'weekly', approvalMode: 'auto' }))
    expect(upsertAutopilotSettings).toHaveBeenCalledWith('u1', {
      cadence: 'ship_moments',
      postDays: [0, 1, 2, 3, 4, 5, 6],
      approvalMode: 'review',
    })
  })

  it('accepts voice samples without storing them', async () => {
    const res = await PATCH(patch({ voiceSamples: ['x'.repeat(80)], tonePreset: 'teacher' }))
    expect(res.status).toBe(200)
    expect(upsertUserProfile).toHaveBeenCalledWith('u1', { tonePreset: 'teacher' })
  })
})
