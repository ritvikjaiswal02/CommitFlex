import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SubscriptionRow } from '@/lib/db/schema'

const q = vi.hoisted(() => ({
  getEntitledSubscription: vi.fn(),
  getTrialEndsAt: vi.fn(),
  countUsage: vi.fn(),
  incrementUsageCounter: vi.fn(),
}))
vi.mock('@/lib/db/queries/billing', () => q)

import {
  PlanError,
  assertFeature,
  assertWithinLimit,
  currentPeriod,
  getUsage,
  getUserPlan,
  hasFeature,
  planErrorToResponse,
  recordUsage,
} from '@/lib/plans'

const DAY = 86_400_000

function sub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  const now = new Date()
  return {
    id: 'sub-1',
    userId: 'u1',
    provider: 'razorpay',
    plan: 'pro',
    interval: 'month',
    currency: 'INR',
    status: 'active',
    razorpaySubscriptionId: 'sub_RZP1',
    razorpayPlanId: 'plan_X',
    razorpayCustomerId: null,
    lastPaymentId: null,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(Date.now() + 20 * DAY),
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  q.getEntitledSubscription.mockResolvedValue(null)
  q.getTrialEndsAt.mockResolvedValue(null)
  q.countUsage.mockResolvedValue(0)
})

describe('currentPeriod', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(currentPeriod(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01')
    expect(currentPeriod(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12')
  })
})

describe('getUserPlan', () => {
  it('is free without subscription or trial', async () => {
    const plan = await getUserPlan('u1')
    expect(plan.id).toBe('free')
    expect(plan.status).toBe('free')
    expect(plan.subscriptionId).toBeNull()
  })

  it('is a Pro trial while trial_ends_at is in the future', async () => {
    const ends = new Date(Date.now() + 3 * DAY)
    q.getTrialEndsAt.mockResolvedValue(ends)
    const plan = await getUserPlan('u1')
    expect(plan.id).toBe('pro')
    expect(plan.status).toBe('trialing')
    expect(plan.trialEndsAt).toEqual(ends)
  })

  it('falls back to free after the trial ends', async () => {
    q.getTrialEndsAt.mockResolvedValue(new Date(Date.now() - DAY))
    const plan = await getUserPlan('u1')
    expect(plan.id).toBe('free')
  })

  it('uses the entitled subscription over the trial', async () => {
    q.getTrialEndsAt.mockResolvedValue(new Date(Date.now() + 3 * DAY))
    q.getEntitledSubscription.mockResolvedValue(sub({ plan: 'team', interval: 'year', currency: 'USD' }))
    const plan = await getUserPlan('u1')
    expect(plan).toMatchObject({ id: 'team', status: 'active', interval: 'year', currency: 'USD', subscriptionId: 'sub-1' })
    expect(plan.definition.name).toBe('Team')
  })

  it('maps pending to past_due and cancelled-but-running to cancelling', async () => {
    q.getEntitledSubscription.mockResolvedValue(sub({ status: 'pending' }))
    expect((await getUserPlan('u1')).status).toBe('past_due')
    q.getEntitledSubscription.mockResolvedValue(sub({ status: 'cancelled' }))
    expect((await getUserPlan('u1')).status).toBe('cancelling')
    q.getEntitledSubscription.mockResolvedValue(sub({ status: 'active', cancelAtPeriodEnd: true }))
    const plan = await getUserPlan('u1')
    expect(plan.status).toBe('cancelling')
    expect(plan.cancelAtPeriodEnd).toBe(true)
  })
})

describe('feature checks', () => {
  it('hasFeature follows the effective plan', async () => {
    expect(await hasFeature('u1', 'autopilot.weekly_digest')).toBe(true)
    expect(await hasFeature('u1', 'autopilot.ship_moments')).toBe(false)
    q.getTrialEndsAt.mockResolvedValue(new Date(Date.now() + DAY))
    expect(await hasFeature('u1', 'autopilot.ship_moments')).toBe(true)
  })

  it('assertFeature throws a 402 PlanError with the body', async () => {
    const err = await assertFeature('u1', 'drafts.variants').catch((e) => e)
    expect(err).toBeInstanceOf(PlanError)
    expect(err.status).toBe(402)
    expect(err.body).toMatchObject({ code: 'feature_locked', feature: 'drafts.variants', requiredPlan: 'pro', currentPlan: 'free' })

    q.getEntitledSubscription.mockResolvedValue(sub())
    const teamOnly = await assertFeature('u1', 'team.reviewers').catch((e) => e)
    expect(teamOnly.body).toMatchObject({ requiredPlan: 'team', currentPlan: 'pro' })
  })

  it('assertFeature returns the plan when allowed', async () => {
    q.getEntitledSubscription.mockResolvedValue(sub())
    const plan = await assertFeature('u1', 'publish.linkedin_direct')
    expect(plan.id).toBe('pro')
  })
})

describe('assertWithinLimit', () => {
  it('passes while used + adding <= max', async () => {
    q.countUsage.mockResolvedValue(9)
    const res = await assertWithinLimit('u1', 'generationsPerMonth')
    expect(res).toMatchObject({ used: 9, max: 10 })
    expect(q.countUsage).toHaveBeenCalledWith('u1', 'generationsPerMonth', currentPeriod())
  })

  it('throws limit_reached with the spec copy', async () => {
    q.countUsage.mockResolvedValue(10)
    const err = await assertWithinLimit('u1', 'generationsPerMonth').catch((e) => e)
    expect(err).toBeInstanceOf(PlanError)
    expect(err.body).toEqual({
      error: "You've used 10 of 10 drafts this month. Pro includes 150 a month.",
      code: 'limit_reached',
      limit: 'generationsPerMonth',
      used: 10,
      max: 10,
      requiredPlan: 'pro',
      currentPlan: 'free',
    })
  })

  it('honours the adding option', async () => {
    q.countUsage.mockResolvedValue(0)
    await expect(assertWithinLimit('u1', 'repos', { adding: 2 })).rejects.toBeInstanceOf(PlanError)
    await expect(assertWithinLimit('u1', 'repos', { adding: 0 })).resolves.toMatchObject({ used: 0, max: 1 })
  })

  it('points Pro users at Team', async () => {
    q.getEntitledSubscription.mockResolvedValue(sub())
    q.countUsage.mockResolvedValue(150)
    const err = await assertWithinLimit('u1', 'generationsPerMonth').catch((e) => e)
    expect(err.body).toMatchObject({ requiredPlan: 'team', currentPlan: 'pro', max: 150 })
  })
})

describe('usage', () => {
  it('recordUsage increments the current period counter', async () => {
    q.incrementUsageCounter.mockResolvedValue(4)
    await expect(recordUsage('u1', 'generations')).resolves.toBe(4)
    expect(q.incrementUsageCounter).toHaveBeenCalledWith('u1', 'generations', currentPeriod(), 1)
    await recordUsage('u1', 'generations', 3)
    expect(q.incrementUsageCounter).toHaveBeenLastCalledWith('u1', 'generations', currentPeriod(), 3)
  })

  it('getUsage reports every limit against the plan', async () => {
    q.countUsage.mockImplementation(async (_u: string, key: string) => (key === 'repos' ? 1 : 2))
    const usage = await getUsage('u1')
    expect(usage.period).toBe(currentPeriod())
    expect(usage.items.repos).toEqual({ used: 1, max: 1 })
    expect(usage.items.generationsPerMonth).toEqual({ used: 2, max: 10 })
    expect(Object.keys(usage.items)).toHaveLength(6)
  })
})

describe('planErrorToResponse', () => {
  it('turns PlanError into a 402 JSON response', async () => {
    const err = await assertFeature('u1', 'drafts.variants').catch((e) => e)
    const res = planErrorToResponse(err)!
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'feature_locked' })
  })

  it('ignores other errors', () => {
    expect(planErrorToResponse(new Error('boom'))).toBeNull()
    expect(planErrorToResponse(undefined)).toBeNull()
  })
})
