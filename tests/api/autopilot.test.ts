import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({
  getAutopilotSettings: vi.fn(),
  upsertAutopilotSettings: vi.fn(async (_u: string, patch: any) => ({ ...baseSettings, ...patch })),
  listQueue: vi.fn(),
  getQueueStats: vi.fn(),
  listShipEvents: vi.fn(),
}))
vi.mock('@/lib/db/queries/voice', () => ({ getVoiceProfile: vi.fn() }))
vi.mock('@/lib/plans', async () => {
  const catalog = await vi.importActual<typeof import('@/lib/billing/catalog')>('@/lib/billing/catalog')
  class PlanError extends Error {
    readonly status = 402
    constructor(readonly body: any) {
      super(body.error)
      this.name = 'PlanError'
    }
  }
  return {
    ...catalog,
    PlanError,
    getUserPlan: vi.fn(),
    featureLockedBody: (feature: string, currentPlan: string) => ({ error: 'locked', code: 'feature_locked', feature, requiredPlan: 'pro', currentPlan }),
    limitReachedBody: (limit: string, used: number, max: number, currentPlan: string) => ({ error: 'limit', code: 'limit_reached', limit, used, max, requiredPlan: 'team', currentPlan }),
    planErrorToResponse: (err: any) => (err?.name === 'PlanError' ? Response.json(err.body, { status: 402 }) : null),
  }
})
vi.mock('@/lib/autopilot/queue', async () => {
  const errors = await vi.importActual<typeof import('@/lib/autopilot/errors')>('@/lib/autopilot/errors')
  return {
    ...errors,
    approveDraft: vi.fn(),
    scheduleDraft: vi.fn(),
    unscheduleDraft: vi.fn(),
    skipDraft: vi.fn(),
    publishDraftNow: vi.fn(),
    recordManualPublish: vi.fn(),
  }
})

import { auth } from '@/auth'
import { getAutopilotSettings, upsertAutopilotSettings, listQueue, getQueueStats, listShipEvents } from '@/lib/db/queries/autopilot'
import { getVoiceProfile } from '@/lib/db/queries/voice'
import { getUserPlan } from '@/lib/plans'
import { QueueError } from '@/lib/autopilot/errors'
import { approveDraft, scheduleDraft, publishDraftNow, recordManualPublish } from '@/lib/autopilot/queue'
import { GET as getSettings, PUT as putSettings } from '@/app/api/autopilot/settings/route'
import { GET as getQueue } from '@/app/api/autopilot/queue/route'
import { GET as getShipEvents } from '@/app/api/autopilot/ship-events/route'
import { POST as approve } from '@/app/api/drafts/[draftId]/approve/route'
import { POST as schedule } from '@/app/api/drafts/[draftId]/schedule/route'
import { POST as publish } from '@/app/api/drafts/[draftId]/publish/route'
import { POST as posted } from '@/app/api/drafts/[draftId]/posted/route'

const baseSettings = {
  enabled: true,
  cadence: 'ship_moments',
  postDays: [2, 4],
  postTime: '09:00',
  triggers: ['pr_merged', 'release_published', 'weekly_digest'],
  platforms: ['linkedin', 'twitter'],
  approvalMode: 'review',
  reviewerEmails: [],
  defaultVoiceProfileId: null,
  pausedUntil: null,
  timezone: 'Asia/Kolkata',
}

function put(body: unknown) {
  return putSettings(new Request('http://localhost/api/autopilot/settings', { method: 'PUT', body: JSON.stringify(body) }))
}

const params = { params: { draftId: 'draft-1' } }
function post(body?: unknown) {
  return new Request('http://localhost/x', { method: 'POST', body: body === undefined ? '' : JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(getAutopilotSettings).mockResolvedValue(baseSettings as any)
  vi.mocked(getUserPlan).mockResolvedValue({ id: 'free', status: 'free' } as any)
})

describe('/api/autopilot/settings', () => {
  it('returns settings, the next five slots and the plan', async () => {
    const res = await getSettings()
    const data = await res.json()
    expect(data.settings.timezone).toBe('Asia/Kolkata')
    expect(data.nextSlots).toHaveLength(5)
    expect(data.plan).toEqual({ id: 'free', status: 'free' })
  })

  it('401s when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await getSettings()).status).toBe(401)
    expect((await put({})).status).toBe(401)
  })

  it('locks fixed cadences, auto-approve and reviewers behind plans', async () => {
    let res = await put({ cadence: 'weekdays' })
    expect(res.status).toBe(402)
    expect((await res.json()).feature).toBe('autopilot.cadence')

    res = await put({ approvalMode: 'auto' })
    expect((await res.json()).feature).toBe('publish.auto_approve')

    vi.mocked(getUserPlan).mockResolvedValue({ id: 'pro', status: 'active' } as any)
    res = await put({ reviewerEmails: ['a@b.co'] })
    expect((await res.json()).feature).toBe('team.reviewers')
    expect(upsertAutopilotSettings).not.toHaveBeenCalled()
  })

  it('enforces the reviewer limit on Team', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'team', status: 'active' } as any)
    const emails = ['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co', 'e@x.co', 'f@x.co']
    const res = await put({ reviewerEmails: emails })
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe('limit_reached')
  })

  it('switches post days to the new cadence defaults', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'pro', status: 'active' } as any)
    const res = await put({ cadence: 'three_weekly', postTime: '18:00' })
    expect(res.status).toBe(200)
    expect(upsertAutopilotSettings).toHaveBeenCalledWith('user-1', expect.objectContaining({
      cadence: 'three_weekly', postDays: [1, 3, 5], postTime: '18:00',
    }))
  })

  it('rejects unknown fields, bad times and a foreign voice profile', async () => {
    expect((await put({ timezone: 'UTC' })).status).toBe(400)
    expect((await put({ postTime: '25:00' })).status).toBe(400)
    vi.mocked(getVoiceProfile).mockResolvedValue({ userId: 'other' } as any)
    expect((await put({ defaultVoiceProfileId: '8b7f4b44-3c1a-4f1e-9a55-0f5b7a3e2d11' })).status).toBe(404)
  })
})

describe('/api/autopilot/queue and ship events', () => {
  it('parses filters and returns items with stats', async () => {
    vi.mocked(listQueue).mockResolvedValue([{ id: 'q1' }] as any)
    vi.mocked(getQueueStats).mockResolvedValue({ pendingReview: 1 } as any)
    const res = await getQueue(new Request('http://localhost/api/autopilot/queue?status=pending_review,scheduled&platform=twitter&limit=20'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [{ id: 'q1' }], stats: { pendingReview: 1 } })
    expect(listQueue).toHaveBeenCalledWith('user-1', expect.objectContaining({
      statuses: ['pending_review', 'scheduled'], platform: 'twitter', limit: 20,
    }))
  })

  it('rejects unknown statuses and oversized limits', async () => {
    expect((await getQueue(new Request('http://localhost/api/autopilot/queue?status=bogus'))).status).toBe(400)
    expect((await getQueue(new Request('http://localhost/api/autopilot/queue?limit=500'))).status).toBe(400)
  })

  it('lists ship events', async () => {
    vi.mocked(listShipEvents).mockResolvedValue([{ id: 's1' }] as any)
    const res = await getShipEvents(new Request('http://localhost/api/autopilot/ship-events?limit=5'))
    expect(await res.json()).toEqual({ events: [{ id: 's1' }] })
    expect(listShipEvents).toHaveBeenCalledWith('user-1', 5)
  })
})

describe('draft queue action routes', () => {
  it('approves', async () => {
    vi.mocked(approveDraft).mockResolvedValue({ id: 'q1', status: 'approved' } as any)
    const res = await approve(post({}), params)
    expect(await res.json()).toEqual({ item: { id: 'q1', status: 'approved' } })
    expect(approveDraft).toHaveBeenCalledWith('user-1', 'draft-1', 'owner')
  })

  it('maps QueueError to its status and code', async () => {
    vi.mocked(approveDraft).mockRejectedValue(new QueueError(409, 'invalid_state', 'Already published'))
    const res = await approve(post({}), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Already published', code: 'invalid_state' })
  })

  it('schedules at a time or the next slot', async () => {
    vi.mocked(scheduleDraft).mockResolvedValue({ id: 'q1' } as any)
    await schedule(post(), params)
    expect(scheduleDraft).toHaveBeenLastCalledWith('user-1', 'draft-1', 'next_slot')
    await schedule(post({ at: '2026-11-05T09:00:00+05:30' }), params)
    expect(scheduleDraft).toHaveBeenLastCalledWith('user-1', 'draft-1', new Date('2026-11-05T03:30:00Z'))
    expect((await schedule(post({ at: 'tomorrow' }), params)).status).toBe(400)
  })

  it('publishes and returns the hand-off result', async () => {
    vi.mocked(publishDraftNow).mockResolvedValue({
      item: { id: 'q1', status: 'ready' },
      result: { method: 'x_intent', url: null, intentUrl: 'https://x.com/intent/post?text=hi' },
    } as any)
    const res = await publish(post({}), params)
    expect((await res.json()).result.method).toBe('x_intent')
  })

  it('marks posted with an optional URL', async () => {
    vi.mocked(recordManualPublish).mockResolvedValue({ id: 'q1', status: 'published' } as any)
    await posted(post({ method: 'x_intent', url: 'https://x.com/me/status/1' }), params)
    expect(recordManualPublish).toHaveBeenCalledWith({
      userId: 'user-1', draftId: 'draft-1', method: 'x_intent', externalUrl: 'https://x.com/me/status/1',
    })
    expect((await posted(post({ method: 'carrier-pigeon' }), params)).status).toBe(400)
  })
})
