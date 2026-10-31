import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import type { SubscriptionRow } from '@/lib/db/schema'
import { PLANS } from '@/lib/billing/catalog'

const authMock = vi.hoisted(() => ({ auth: vi.fn() }))
const plans = vi.hoisted(() => ({ getUserPlan: vi.fn() }))
const q = vi.hoisted(() => ({
  getSubscriptionByRazorpayId: vi.fn(),
  getEntitledSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}))
const rzp = vi.hoisted(() => ({ fetchSubscription: vi.fn(), cancelSubscription: vi.fn() }))
const sync = vi.hoisted(() => ({ upsertSubscriptionFromRazorpay: vi.fn(), enforcePlanLimits: vi.fn() }))

vi.mock('@/auth', () => authMock)
vi.mock('@/lib/plans', () => plans)
vi.mock('@/lib/db/queries/billing', () => q)
vi.mock('@/lib/billing/sync', () => sync)
vi.mock('@/lib/billing/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/billing/razorpay')>()), ...rzp }))

import { POST as verify } from '@/app/api/billing/verify/route'
import { POST as cancel } from '@/app/api/billing/cancel/route'
import { RazorpayError } from '@/lib/billing/razorpay'

const SECRET = 'rzp_secret'
const DAY = 86_400_000

function sign(paymentId: string, subscriptionId: string) {
  return createHmac('sha256', SECRET).update(`${paymentId}|${subscriptionId}`).digest('hex')
}

function post(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

function subRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  const now = new Date()
  return {
    id: 'local-1', userId: 'u1', provider: 'razorpay', plan: 'pro', interval: 'month', currency: 'INR', status: 'created',
    razorpaySubscriptionId: 'sub_1', razorpayPlanId: 'plan_pro_m_inr', razorpayCustomerId: null, lastPaymentId: null,
    currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, createdAt: now, updatedAt: now,
    ...overrides,
  }
}

function remote(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'sub_1', plan_id: 'plan_pro_m_inr', customer_id: 'cust_1', status,
    current_start: null, current_end: null, ended_at: null, charge_at: null, notes: { userId: 'u1' }, ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RAZORPAY_KEY_SECRET = SECRET
  authMock.auth.mockResolvedValue({ user: { id: 'u1' } })
  plans.getUserPlan.mockResolvedValue({ id: 'pro', definition: PLANS.pro, status: 'active' })
  q.updateSubscription.mockImplementation(async (id: string, patch: Partial<SubscriptionRow>) => subRow({ id, ...patch }))
})

afterEach(() => {
  delete process.env.RAZORPAY_KEY_SECRET
})

describe('POST /api/billing/verify', () => {
  const url = 'http://localhost/api/billing/verify'
  const valid = () => ({ razorpay_payment_id: 'pay_1', razorpay_subscription_id: 'sub_1', razorpay_signature: sign('pay_1', 'sub_1') })

  it('returns 401 when signed out', async () => {
    authMock.auth.mockResolvedValue(null)
    expect((await verify(post(url, valid()))).status).toBe(401)
  })

  it('returns 400 for a missing field', async () => {
    const res = await verify(post(url, { razorpay_payment_id: 'pay_1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_request')
  })

  it('returns 400 invalid_signature for a forged signature', async () => {
    const res = await verify(post(url, { ...valid(), razorpay_signature: 'deadbeef' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_signature')
    expect(sync.upsertSubscriptionFromRazorpay).not.toHaveBeenCalled()
  })

  it("returns 404 for a subscription that isn't the user's", async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(subRow({ userId: 'someone-else' }))
    const res = await verify(post(url, valid()))
    expect(res.status).toBe(404)
    q.getSubscriptionByRazorpayId.mockResolvedValue(null)
    expect((await verify(post(url, valid()))).status).toBe(404)
  })

  it('saves the subscription and returns the effective plan', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(subRow())
    rzp.fetchSubscription.mockResolvedValue(remote('active'))
    const res = await verify(post(url, valid()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, plan: 'pro', status: 'active' })
    expect(sync.upsertSubscriptionFromRazorpay).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub_1', status: 'active' }),
      { userId: 'u1', paymentId: 'pay_1' },
    )
  })

  it("treats a still-'created' subscription as authenticated after a valid signature", async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(subRow())
    rzp.fetchSubscription.mockResolvedValue(remote('created'))
    await verify(post(url, valid()))
    expect(sync.upsertSubscriptionFromRazorpay).toHaveBeenCalledWith(expect.objectContaining({ status: 'authenticated' }), expect.anything())
  })

  it('falls back to the local row when Razorpay is unreachable', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(subRow())
    rzp.fetchSubscription.mockRejectedValue(new RazorpayError('down', 502, 'network_error'))
    const res = await verify(post(url, valid()))
    expect(res.status).toBe(200)
    expect(sync.upsertSubscriptionFromRazorpay).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub_1', plan_id: 'plan_pro_m_inr', status: 'authenticated' }),
      { userId: 'u1', paymentId: 'pay_1' },
    )
  })
})

describe('POST /api/billing/cancel', () => {
  const url = 'http://localhost/api/billing/cancel'
  const periodEnd = new Date(Date.now() + 20 * DAY)

  it('returns 401 when signed out', async () => {
    authMock.auth.mockResolvedValue(null)
    expect((await cancel(post(url, {}))).status).toBe(401)
  })

  it('returns 404 no_subscription without a paid plan', async () => {
    q.getEntitledSubscription.mockResolvedValue(null)
    const res = await cancel(post(url, {}))
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('no_subscription')
  })

  it('validates the body', async () => {
    const res = await cancel(post(url, { atPeriodEnd: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('cancels at period end by default and keeps access', async () => {
    q.getEntitledSubscription.mockResolvedValue(subRow({ status: 'active', currentPeriodEnd: periodEnd }))
    rzp.cancelSubscription.mockResolvedValue(remote('active', { current_end: Math.floor(periodEnd.getTime() / 1000) }))
    const res = await cancel(post(url, {}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.cancelAtPeriodEnd).toBe(true)
    expect(new Date(body.currentPeriodEnd).getTime()).toBe(Math.floor(periodEnd.getTime() / 1000) * 1000)
    expect(rzp.cancelSubscription).toHaveBeenCalledWith('sub_1', { atCycleEnd: true })
    expect(q.updateSubscription).toHaveBeenCalledWith('local-1', expect.objectContaining({ cancelAtPeriodEnd: true }))
    expect(sync.enforcePlanLimits).not.toHaveBeenCalled()
  })

  it('is idempotent when already set to cancel', async () => {
    q.getEntitledSubscription.mockResolvedValue(subRow({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd }))
    const res = await cancel(post(url, { atPeriodEnd: true }))
    expect(res.status).toBe(200)
    expect(rzp.cancelSubscription).not.toHaveBeenCalled()
    q.getEntitledSubscription.mockResolvedValue(subRow({ status: 'cancelled', currentPeriodEnd: periodEnd }))
    expect((await (await cancel(post(url, {}))).json()).cancelAtPeriodEnd).toBe(true)
    expect(rzp.cancelSubscription).not.toHaveBeenCalled()
  })

  it('cancels immediately and enforces Free limits when asked', async () => {
    q.getEntitledSubscription.mockResolvedValue(subRow({ status: 'active', currentPeriodEnd: periodEnd }))
    rzp.cancelSubscription.mockResolvedValue(remote('cancelled'))
    const res = await cancel(post(url, { atPeriodEnd: false }))
    expect(res.status).toBe(200)
    expect(rzp.cancelSubscription).toHaveBeenCalledWith('sub_1', { atCycleEnd: false })
    expect(q.updateSubscription).toHaveBeenCalledWith('local-1', expect.objectContaining({ status: 'cancelled', cancelAtPeriodEnd: false }))
    expect(sync.enforcePlanLimits).toHaveBeenCalledWith('u1')
  })

  it('ends an authenticated-but-uncharged subscription when cycle-end cancel is refused', async () => {
    q.getEntitledSubscription.mockResolvedValue(subRow({ status: 'authenticated' }))
    rzp.cancelSubscription
      .mockRejectedValueOnce(new RazorpayError('nope', 400, 'BAD_REQUEST_ERROR', 'cannot cancel at cycle end'))
      .mockResolvedValueOnce(remote('cancelled'))
    const res = await cancel(post(url, {}))
    expect(res.status).toBe(200)
    expect(rzp.cancelSubscription).toHaveBeenLastCalledWith('sub_1', { atCycleEnd: false })
    expect(sync.enforcePlanLimits).toHaveBeenCalledWith('u1')
  })

  it('returns 502 when Razorpay refuses', async () => {
    q.getEntitledSubscription.mockResolvedValue(subRow({ status: 'active' }))
    rzp.cancelSubscription.mockRejectedValue(new RazorpayError('nope', 500, 'SERVER_ERROR'))
    const res = await cancel(post(url, {}))
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('upstream_error')
    expect(q.updateSubscription).not.toHaveBeenCalled()
  })
})
