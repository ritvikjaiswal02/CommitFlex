import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BillingEventRow, SubscriptionRow } from '@/lib/db/schema'
import { entitledStatus, isEntitledRow, pickEntitled } from '@/lib/billing/entitlement'

const q = vi.hoisted(() => ({
  claimBillingEvent: vi.fn(async () => true),
  disableRepoAutopilot: vi.fn(),
  forceReviewApprovalMode: vi.fn(),
  getSubscriptionByRazorpayId: vi.fn(),
  insertSubscription: vi.fn(),
  listAutopilotRepos: vi.fn(),
  listSubscriptions: vi.fn(),
  markBillingEventProcessed: vi.fn(),
  recordBillingEvent: vi.fn(),
  updateSubscription: vi.fn(),
  userExists: vi.fn(),
}))
const plans = vi.hoisted(() => ({ getUserPlan: vi.fn() }))
const rzp = vi.hoisted(() => ({ cancelSubscription: vi.fn() }))

vi.mock('@/lib/db/queries/billing', () => q)
vi.mock('@/lib/plans', () => plans)
vi.mock('@/lib/billing/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/billing/razorpay')>()), ...rzp }))

import { applyWebhookEvent, enforcePlanLimits, mapRazorpayStatus, upsertSubscriptionFromRazorpay, webhookKind } from '@/lib/billing/sync'
import type { RazorpaySubscription } from '@/lib/billing/razorpay'

const DAY = 86_400_000
const nowSec = () => Math.floor(Date.now() / 1000)

function row(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  const now = new Date()
  return {
    id: 'local-1', userId: 'u1', provider: 'razorpay', plan: 'pro', interval: 'month', currency: 'INR',
    status: 'created', razorpaySubscriptionId: 'sub_1', razorpayPlanId: 'plan_pro_m_inr', razorpayCustomerId: null,
    lastPaymentId: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null,
    createdAt: now, updatedAt: now, ...overrides,
  }
}

function rzpSub(overrides: Partial<RazorpaySubscription> = {}): RazorpaySubscription {
  return {
    id: 'sub_1', plan_id: 'plan_pro_m_inr', customer_id: 'cust_1', status: 'active',
    current_start: nowSec() - DAY / 1000, current_end: nowSec() + 29 * (DAY / 1000), ended_at: null, charge_at: null,
    notes: { userId: 'u1', plan: 'pro', interval: 'month', currency: 'INR' }, ...overrides,
  }
}

function plan(id: 'free' | 'pro' | 'team') {
  return { id, status: id === 'free' ? 'free' : 'active' }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RAZORPAY_PLAN_PRO_MONTHLY_INR = 'plan_pro_m_inr'
  q.listSubscriptions.mockResolvedValue([])
  q.updateSubscription.mockImplementation(async (id: string, patch: Partial<SubscriptionRow>) => row({ id, ...patch }))
  q.insertSubscription.mockImplementation(async (values: Partial<SubscriptionRow>) => row({ id: 'new-1', ...values }))
  q.recordBillingEvent.mockImplementation(async () => ({ row: { id: 'evt-row', processedAt: null, userId: null } as BillingEventRow, created: true }))
  q.listAutopilotRepos.mockResolvedValue([])
  plans.getUserPlan.mockResolvedValue(plan('pro'))
})

describe('entitlement rules', () => {
  it('entitles live statuses and cancelled rows with time left', () => {
    const future = new Date(Date.now() + DAY)
    const past = new Date(Date.now() - DAY)
    expect(isEntitledRow(row({ status: 'active' }))).toBe(true)
    expect(isEntitledRow(row({ status: 'authenticated' }))).toBe(true)
    expect(isEntitledRow(row({ status: 'pending' }))).toBe(true)
    expect(isEntitledRow(row({ status: 'cancelled', currentPeriodEnd: future }))).toBe(true)
    expect(isEntitledRow(row({ status: 'cancelled', currentPeriodEnd: past }))).toBe(false)
    expect(isEntitledRow(row({ status: 'halted' }))).toBe(false)
    expect(isEntitledRow(row({ status: 'created' }))).toBe(false)
    expect(isEntitledRow(row({ status: 'active', plan: 'free' }))).toBe(false)
  })

  it('picks the best plan and labels its status', () => {
    const pro = row({ id: 'p', status: 'active' })
    const team = row({ id: 't', status: 'pending', plan: 'team' })
    expect(pickEntitled([pro, team])?.id).toBe('t')
    expect(pickEntitled([row({ status: 'created' })])).toBeNull()
    expect(entitledStatus(team)).toBe('past_due')
    expect(entitledStatus(row({ status: 'cancelled' }))).toBe('cancelling')
    expect(entitledStatus(pro)).toBe('active')
  })
})

describe('mapRazorpayStatus / webhookKind', () => {
  it('passes through known statuses', () => {
    expect(mapRazorpayStatus('active')).toBe('active')
    expect(mapRazorpayStatus('HALTED')).toBe('halted')
    expect(mapRazorpayStatus('weird')).toBe('created')
  })
  it('classifies events', () => {
    expect(webhookKind('subscription.activated')).toBe('activated')
    expect(webhookKind('subscription.charged')).toBe('charged')
    expect(webhookKind('subscription.pending')).toBe('payment_failed')
    expect(webhookKind('subscription.cancelled')).toBe('cancelled')
    expect(webhookKind('subscription.halted')).toBe('halted')
    expect(webhookKind('subscription.paused')).toBe('other')
  })
})

describe('upsertSubscriptionFromRazorpay', () => {
  it('updates the existing row with status, period and payment', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row())
    const sub = rzpSub()
    const result = await upsertSubscriptionFromRazorpay(sub, { userId: 'u1', paymentId: 'pay_1' })
    expect(q.updateSubscription).toHaveBeenCalledWith('local-1', expect.objectContaining({
      status: 'active', razorpayCustomerId: 'cust_1', lastPaymentId: 'pay_1', plan: 'pro', interval: 'month', currency: 'INR',
      currentPeriodEnd: new Date(sub.current_end! * 1000),
    }))
    expect(result.status).toBe('active')
  })

  it('inserts when no local row exists', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(null)
    await upsertSubscriptionFromRazorpay(rzpSub(), { userId: 'u1' })
    expect(q.insertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', plan: 'pro', razorpaySubscriptionId: 'sub_1', status: 'active',
    }))
  })

  it('refuses a row owned by someone else', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row({ userId: 'other' }))
    await expect(upsertSubscriptionFromRazorpay(rzpSub(), { userId: 'u1' })).rejects.toThrow('different user')
  })

  it('cancels other entitled subscriptions immediately when this one goes live', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row())
    const old = row({ id: 'old', razorpaySubscriptionId: 'sub_old', status: 'active', plan: 'team' })
    q.listSubscriptions.mockResolvedValue([row({ status: 'active' }), old])
    rzp.cancelSubscription.mockRejectedValue(new Error('already cancelled'))
    await upsertSubscriptionFromRazorpay(rzpSub(), { userId: 'u1' })
    expect(rzp.cancelSubscription).toHaveBeenCalledWith('sub_old', { atCycleEnd: false })
    expect(q.updateSubscription).toHaveBeenCalledWith('old', expect.objectContaining({ status: 'cancelled', cancelAtPeriodEnd: false }))
    const patch = q.updateSubscription.mock.calls.find((c) => c[0] === 'old')![1]
    expect(patch.currentPeriodEnd.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('never resurrects a cancelled subscription from a late event', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row({ status: 'cancelled', currentPeriodEnd: new Date(Date.now() - 1000) }))
    await upsertSubscriptionFromRazorpay(rzpSub({ status: 'active' }), { userId: 'u1' })
    expect(q.updateSubscription.mock.calls[0][1].status).toBe('cancelled')
    expect(rzp.cancelSubscription).not.toHaveBeenCalled()
  })

  it('uses ended_at for an immediate cancel so access stops now', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row({ status: 'active' }))
    const endedAt = nowSec()
    await upsertSubscriptionFromRazorpay(rzpSub({ status: 'cancelled', ended_at: endedAt }), { userId: 'u1' })
    const patch = q.updateSubscription.mock.calls[0][1]
    expect(patch.status).toBe('cancelled')
    expect(patch.currentPeriodEnd).toEqual(new Date(endedAt * 1000))
    expect(patch.cancelledAt).toEqual(new Date(endedAt * 1000))
  })
})

describe('applyWebhookEvent', () => {
  const event = (name: string, sub = rzpSub(), paymentId?: string) => ({
    event: name,
    payload: { subscription: { entity: sub }, ...(paymentId ? { payment: { entity: { id: paymentId, status: 'captured' } } } : {}) },
    created_at: nowSec(),
  })

  it('skips already processed events', async () => {
    q.recordBillingEvent.mockResolvedValue({ row: { id: 'evt', processedAt: new Date(), userId: 'u1' }, created: false })
    const res = await applyWebhookEvent('evt_1', event('subscription.charged'))
    expect(res).toEqual({ handled: false, duplicate: true, userId: 'u1', kind: 'charged' })
    expect(q.updateSubscription).not.toHaveBeenCalled()
  })

  it('reprocesses an event that failed before', async () => {
    q.recordBillingEvent.mockResolvedValue({ row: { id: 'evt', processedAt: null, userId: null }, created: false })
    q.getSubscriptionByRazorpayId.mockResolvedValue(row())
    const res = await applyWebhookEvent('evt_1', event('subscription.activated'))
    expect(res.handled).toBe(true)
  })

  it('syncs the subscription and records the payment id', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row())
    const res = await applyWebhookEvent('evt_2', event('subscription.charged', rzpSub(), 'pay_9'))
    expect(res).toEqual({ handled: true, duplicate: false, userId: 'u1', kind: 'charged' })
    expect(q.updateSubscription).toHaveBeenCalledWith('local-1', expect.objectContaining({ lastPaymentId: 'pay_9' }))
    expect(q.markBillingEventProcessed).toHaveBeenCalledWith('evt-row', { userId: 'u1' })
  })

  it('takes the user from notes only when that user exists', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(null)
    q.userExists.mockResolvedValue(false)
    const res = await applyWebhookEvent('evt_3', event('subscription.activated'))
    expect(res.handled).toBe(false)
    expect(q.insertSubscription).not.toHaveBeenCalled()
    expect(q.markBillingEventProcessed).toHaveBeenCalledWith('evt-row', expect.objectContaining({ processed: true }))

    q.userExists.mockResolvedValue(true)
    const ok = await applyWebhookEvent('evt_4', event('subscription.activated'))
    expect(ok.handled).toBe(true)
    expect(q.insertSubscription).toHaveBeenCalled()
  })

  it('ignores subscriptions for plans that are not ours', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(null)
    q.userExists.mockResolvedValue(true)
    const res = await applyWebhookEvent('evt_5', event('subscription.activated', rzpSub({ plan_id: 'plan_other_app', notes: { userId: 'u1' } })))
    expect(res.handled).toBe(false)
  })

  it('handles events without a subscription', async () => {
    const res = await applyWebhookEvent('evt_6', { event: 'payment.failed', payload: {}, created_at: nowSec() })
    expect(res).toEqual({ handled: false, duplicate: false, userId: null, kind: 'other' })
  })

  it('enforces limits after a downgrade', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row({ status: 'active' }))
    plans.getUserPlan
      .mockResolvedValueOnce(plan('pro'))
      .mockResolvedValueOnce(plan('free'))
      .mockResolvedValue(plan('free'))
    q.listAutopilotRepos.mockResolvedValue([
      { id: 'r-old', connectedAt: new Date(1) },
      { id: 'r-mid', connectedAt: new Date(2) },
      { id: 'r-new', connectedAt: new Date(3) },
    ])
    await applyWebhookEvent('evt_7', event('subscription.halted', rzpSub({ status: 'halted' })))
    expect(q.disableRepoAutopilot).toHaveBeenCalledWith(['r-mid', 'r-new'])
    expect(q.forceReviewApprovalMode).toHaveBeenCalledWith('u1')
  })

  it('records the error and rethrows on failure', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(row())
    q.updateSubscription.mockRejectedValueOnce(new Error('db down'))
    await expect(applyWebhookEvent('evt_8', event('subscription.charged'))).rejects.toThrow('db down')
    expect(q.markBillingEventProcessed).toHaveBeenCalledWith('evt-row', { error: 'db down' })
  })
})

describe('enforcePlanLimits', () => {
  it('leaves everything alone within limits', async () => {
    plans.getUserPlan.mockResolvedValue(plan('pro'))
    q.listAutopilotRepos.mockResolvedValue([{ id: 'r1', connectedAt: new Date() }])
    await enforcePlanLimits('u1')
    expect(q.disableRepoAutopilot).not.toHaveBeenCalled()
    expect(q.forceReviewApprovalMode).not.toHaveBeenCalled()
  })
})
