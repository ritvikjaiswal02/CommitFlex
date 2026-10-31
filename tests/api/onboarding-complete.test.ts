import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/env', () => ({ appUrl: () => 'https://app.test', isConfigured: () => false }))
vi.mock('@/lib/plans', () => ({ getUserPlan: vi.fn() }))
vi.mock('@/lib/ai/voice-analyzer', () => ({ analyzeVoiceSamples: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => ({ getUserRepos: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({ upsertAutopilotSettings: vi.fn() }))
vi.mock('@/lib/db/queries/integrations', () => ({ getLinkedInConnectionSummary: vi.fn() }))
vi.mock('@/lib/db/queries/onboarding', () => ({
  getUserProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
  startTrialIfEligible: vi.fn(),
}))
vi.mock('@/lib/db/queries/voice', () => ({
  getDefaultVoiceProfile: vi.fn(),
  updateVoiceProfile: vi.fn(),
  createVoiceProfile: vi.fn(),
}))
vi.mock('@/lib/pipeline/start', () => ({ startGenerationJob: vi.fn(), runInBackground: vi.fn() }))
vi.mock('@/lib/pipeline/run', () => ({ continuePrefetchedJob: vi.fn(async () => true) }))
vi.mock('@/lib/db/queries/jobs', () => ({
  getOnboardingPrefetchJob: vi.fn(async () => null),
  releasePrefetchedJob: vi.fn(async () => undefined),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
  rateLimitResponse: vi.fn(() => Response.json({ error: 'Too many requests', code: 'rate_limited' }, { status: 429 })),
}))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email/templates/welcome', () => ({ WelcomeEmail: () => null }))

import { auth } from '@/auth'
import { getUserPlan } from '@/lib/plans'
import { analyzeVoiceSamples } from '@/lib/ai/voice-analyzer'
import { getUserRepos } from '@/lib/db/queries/repos'
import { upsertAutopilotSettings } from '@/lib/db/queries/autopilot'
import { getLinkedInConnectionSummary } from '@/lib/db/queries/integrations'
import { getUserProfile, startTrialIfEligible, upsertUserProfile } from '@/lib/db/queries/onboarding'
import { createVoiceProfile, getDefaultVoiceProfile, updateVoiceProfile } from '@/lib/db/queries/voice'
import { startGenerationJob } from '@/lib/pipeline/start'
import { sendEmail } from '@/lib/mailer'
import { POST } from '@/app/api/onboarding/complete/route'

const body = {
  role: 'founder',
  pitch: 'A feature flag service',
  audiences: ['developers', 'customers'],
  platforms: ['linkedin', 'twitter'],
  tonePreset: 'story_led',
  voiceSamples: [],
  cadence: 'twice_weekly',
  postTime: '12:30',
  approvalMode: 'auto',
  timezone: 'Asia/Kolkata',
}

const repos = [
  { id: 'r-old', fullName: 'acme/old', autopilotEnabled: true, connectedAt: new Date('2026-01-01') },
  { id: 'r-new', fullName: 'acme/new', autopilotEnabled: true, connectedAt: new Date('2026-10-01') },
]

function req(b: unknown) {
  return new Request('http://localhost/api/onboarding/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', email: 'dev@acme.dev', name: 'Ada Lovelace' } } as any)
  vi.mocked(getUserRepos).mockResolvedValue(repos as any)
  vi.mocked(getUserProfile).mockResolvedValue({ userId: 'u1', onboardedAt: null, country: null } as any)
  vi.mocked(upsertUserProfile).mockResolvedValue({} as any)
  vi.mocked(startTrialIfEligible).mockResolvedValue(null)
  vi.mocked(getUserPlan).mockResolvedValue({ id: 'pro', status: 'trialing', trialEndsAt: new Date('2026-11-15T00:00:00Z') } as any)
  vi.mocked(getDefaultVoiceProfile).mockResolvedValue(null)
  vi.mocked(createVoiceProfile).mockResolvedValue({ id: 'v1' } as any)
  vi.mocked(updateVoiceProfile).mockResolvedValue({ id: 'v-existing' } as any)
  vi.mocked(upsertAutopilotSettings).mockResolvedValue({} as any)
  vi.mocked(startGenerationJob).mockResolvedValue({ ok: true, jobId: 'job-1' })
  vi.mocked(getLinkedInConnectionSummary).mockResolvedValue(null)
  vi.mocked(sendEmail).mockResolvedValue({ ok: true })
})

describe('POST /api/onboarding/complete', () => {
  it('returns 401 when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await POST(req(body))).status).toBe(401)
  })

  it('returns 400 for incomplete answers', async () => {
    const res = await POST(req({ ...body, role: undefined }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_request')
  })

  it('returns 409 no_repos when nothing is connected', async () => {
    vi.mocked(getUserRepos).mockResolvedValue([])
    const res = await POST(req(body))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('no_repos')
    expect(upsertAutopilotSettings).not.toHaveBeenCalled()
  })

  it('saves everything, turns autopilot on and starts the first job', async () => {
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ ok: true, jobId: 'job-1', redirectTo: '/dashboard', trialEndsAt: '2026-11-15T00:00:00.000Z' })

    expect(upsertUserProfile).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        role: 'founder',
        audiences: ['developers', 'customers'],
        tonePreset: 'story_led',
        timezone: 'Asia/Kolkata',
        onboardingStep: 'done',
        onboardedAt: expect.any(Date),
      }),
    )
    expect(createVoiceProfile).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ tone: 'storytelling', technicalLevel: 6, audience: 'developers and customers', makeDefault: true }),
    )
    expect(upsertAutopilotSettings).toHaveBeenCalledWith('u1', {
      enabled: true,
      cadence: 'twice_weekly',
      postDays: [2, 4],
      postTime: '12:30',
      approvalMode: 'auto',
      platforms: ['linkedin', 'twitter'],
      defaultVoiceProfileId: 'v1',
      pausedUntil: null,
    })
    const job = vi.mocked(startGenerationJob).mock.calls[0][0]
    expect(job).toMatchObject({ userId: 'u1', repoId: 'r-new', trigger: 'onboarding', autoQueue: true, voiceProfileId: 'v1' })
    expect(job.source.type).toBe('window')
    if (job.source.type === 'window') {
      const days = (job.source.windowEnd.getTime() - job.source.windowStart.getTime()) / 86_400_000
      expect(days).toBe(14)
    }
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'dev@acme.dev' }))
  })

  it('drafts first from the repo the client picked', async () => {
    await POST(req({ ...body, firstRepoId: '00000000-0000-4000-8000-000000000000' }))
    expect(vi.mocked(startGenerationJob).mock.calls[0][0].repoId).toBe('r-new')

    vi.mocked(getUserRepos).mockResolvedValue([
      ...repos,
      { id: '00000000-0000-4000-8000-000000000000', fullName: 'acme/picked', autopilotEnabled: true, connectedAt: new Date('2025-01-01') },
    ] as any)
    await POST(req({ ...body, firstRepoId: '00000000-0000-4000-8000-000000000000' }))
    expect(vi.mocked(startGenerationJob).mock.calls[1][0].repoId).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('stores the fingerprint when samples are given', async () => {
    vi.mocked(analyzeVoiceSamples).mockResolvedValue({ fingerprint: 'Voice fingerprint: short and dry.' } as any)
    vi.mocked(getDefaultVoiceProfile).mockResolvedValue({ id: 'v-existing' } as any)
    await POST(req({ ...body, voiceSamples: ['x'.repeat(80)] }))
    expect(updateVoiceProfile).toHaveBeenCalledWith(
      'v-existing',
      expect.objectContaining({ extraContext: 'Voice fingerprint: short and dry.' }),
    )
  })

  it('keeps going when the voice analysis fails', async () => {
    vi.mocked(analyzeVoiceSamples).mockRejectedValue(new Error('gemini down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req({ ...body, voiceSamples: ['x'.repeat(80)] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.voiceWarning).toMatch(/Settings/)
    expect(createVoiceProfile).toHaveBeenCalledWith('u1', expect.not.objectContaining({ extraContext: expect.any(String) }))
    spy.mockRestore()
  })

  it('falls back to what the Free plan allows', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'free', status: 'free', trialEndsAt: null } as any)
    const res = await POST(req(body))
    const data = await res.json()
    expect(data.downgraded).toEqual(['cadence', 'approvalMode'])
    expect(upsertAutopilotSettings).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ cadence: 'ship_moments', approvalMode: 'review' }),
    )
  })

  it('reports a job that could not start without failing onboarding', async () => {
    vi.mocked(startGenerationJob).mockResolvedValue({
      ok: false,
      status: 402,
      code: 'limit_reached',
      error: 'You’ve used 10 of 10 drafts this month.',
    })
    const data = await (await POST(req(body))).json()
    expect(data.ok).toBe(true)
    expect(data.jobId).toBeNull()
    expect(data.jobError).toMatch(/10 of 10/)
  })

  it('uses the running job when one is already active', async () => {
    vi.mocked(startGenerationJob).mockResolvedValue({
      ok: false,
      status: 409,
      code: 'active_job',
      error: 'A job is already running',
      jobId: 'job-running',
    })
    const data = await (await POST(req(body))).json()
    expect(data.jobId).toBe('job-running')
    expect(data.jobError).toBeUndefined()
  })

  it('sends the welcome email only on the first completion', async () => {
    vi.mocked(getUserProfile).mockResolvedValue({ userId: 'u1', onboardedAt: new Date('2026-10-01') } as any)
    await POST(req(body))
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
