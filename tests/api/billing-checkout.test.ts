import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SubscriptionRow } from '@/lib/db/schema'
import { PLANS } from '@/lib/billing/catalog'

const authMock = vi.hoisted(() => ({ auth: vi.fn() }))
const plans = vi.hoisted(() => ({ getUserPlan: vi.fn() }))
const q = vi.hoisted(() => ({ insertPendingSubscription: vi.fn(), listSubscriptions: vi.fn() }))
const rzp = vi.hoisted(() => ({ createSubscription: vi.fn(), fetchSubscription: vi.fn() }))

vi.mock('@/auth', () => authMock)
vi.mock('@/lib/plans', () => plans)
vi.mock('@/lib/db/queries/billing', () => q)
vi.mock('@/lib/billing/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/billing/razorpay')>()), ...rzp }))

import { POST } from '@/app/api/billing/checkout/route'
import { resetRateLimits } from '@/app/api/billing/_lib/http'
import { RazorpayError } from '@/lib/billing/razorpay'

const ENV = {
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_PLAN_PRO_MONTHLY_INR: 'plan_pro_m_inr',
  RAZORPAY_PLAN_PRO_YEARLY_INR: 'plan_pro_y_inr',
  RAZORPAY_PLAN_PRO_MONTHLY_USD: 'plan_pro_m_usd',
  RAZORPAY_PLAN_TEAM_MONTHLY_INR: 'plan_team_m_inr',
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function freePlan() {
  return { id: 'free', definition: PLANS.free, status: 'free', interval: null, currency: null, currentPeriodEnd: null, trialEndsAt: null, subscriptionId: null }
}

function subRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  const now = new Date()
  return {
    id: 'local-1', userId: 'u1', provider: 'razorpay', plan: 'pro', interval: 'month', currency: 'INR', status: 'created',
    razorpaySubscriptionId: 'sub_old', razorpayPlanId: 'plan_pro_m_inr', razorpayCustomerId: null, lastPaymentId: null,
    currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, createdAt: now, updatedAt: now,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetRateLimits()
  Object.assign(process.env, ENV)
  authMock.auth.mockResolvedValue({ user: { id: 'u1', name: 'Ritvik J', email: 'r@example.com' } })
  plans.getUserPlan.mockResolvedValue(freePlan())
  q.listSubscriptions.mockResolvedValue([])
  q.insertPendingSubscription.mockImplementation(async (input) => subRow({ ...input, id: 'local-new' }))
  rzp.createSubscription.mockResolvedValue({
    id: 'sub_new', plan_id: 'plan_pro_m_inr', customer_id: null, status: 'created',
    current_start: null, current_end: null, ended_at: null, charge_at: null, notes: {},
  })
})

afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key]
  delete process.env.RAZORPAY_PLAN_PRO_YEARLY_USD
})

describe('POST /api/billing/checkout', () => {
  it('returns 401 when signed out', async () => {
    authMock.auth.mockResolvedValue(null)
    const res = await POST(req({ plan: 'pro', interval: 'month' }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('unauthorized')
  })

  it('validates the body', async () => {
    const res = await POST(req({ plan: 'enterprise', interval: 'week' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('invalid_request')
    expect(body.issues).toBeDefined()
  })

  it('rejects malformed JSON', async () => {
    const res = await POST(req('{nope'))
    expect(res.status).toBe(400)
  })

  it('returns 503 not_configured without Razorpay keys', async () => {
    delete process.env.RAZORPAY_KEY_ID
    const res = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('not_configured')
  })

  it('returns 503 currency_unavailable with the alternative currency', async () => {
    const res = await POST(req({ plan: 'pro', interval: 'year', currency: 'USD' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('currency_unavailable')
    expect(body.alternative).toBe('INR')
  })

  it('creates a subscription and returns checkout options', async () => {
    const res = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR', source: 'billing' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      keyId: 'rzp_test_key',
      subscriptionId: 'sub_new',
      plan: 'pro',
      interval: 'month',
      currency: 'INR',
      amount: 499,
      name: 'CommitFlex',
      description: 'Pro, monthly',
      prefill: { name: 'Ritvik J', email: 'r@example.com' },
    })
    expect(rzp.createSubscription).toHaveBeenCalledWith({
      razorpayPlanId: 'plan_pro_m_inr',
      totalCount: 120,
      notes: { userId: 'u1', plan: 'pro', interval: 'month', currency: 'INR', app: 'commitflex', source: 'billing' },
    })
    expect(q.insertPendingSubscription).toHaveBeenCalledWith({
      userId: 'u1', plan: 'pro', interval: 'month', currency: 'INR', razorpaySubscriptionId: 'sub_new', razorpayPlanId: 'plan_pro_m_inr',
    })
  })

  it('picks the currency from the visitor country when none is given', async () => {
    const res = await POST(req({ plan: 'pro', interval: 'month' }, { 'x-vercel-ip-country': 'US' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.currency).toBe('USD')
    expect(body.amount).toBe(9)
    expect(rzp.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ razorpayPlanId: 'plan_pro_m_usd' }))
  })

  it('uses 10 billing cycles for yearly plans', async () => {
    await POST(req({ plan: 'pro', interval: 'year', currency: 'INR' }))
    expect(rzp.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ razorpayPlanId: 'plan_pro_y_inr', totalCount: 10 }))
  })

  it('returns 409 when already on the same plan and interval', async () => {
    plans.getUserPlan.mockResolvedValue({ ...freePlan(), id: 'pro', definition: PLANS.pro, status: 'active', interval: 'month', currency: 'INR', subscriptionId: 'local-1' })
    const res = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('already_subscribed')
    expect(rzp.createSubscription).not.toHaveBeenCalled()
  })

  it('allows switching interval, upgrading, and resubscribing while cancelling', async () => {
    plans.getUserPlan.mockResolvedValue({ ...freePlan(), id: 'pro', definition: PLANS.pro, status: 'active', interval: 'month', currency: 'INR', subscriptionId: 'local-1' })
    expect((await POST(req({ plan: 'pro', interval: 'year', currency: 'INR' }))).status).toBe(200)
    expect((await POST(req({ plan: 'team', interval: 'month', currency: 'INR' }))).status).toBe(200)
    plans.getUserPlan.mockResolvedValue({ ...freePlan(), id: 'pro', definition: PLANS.pro, status: 'cancelling', interval: 'month', currency: 'INR', subscriptionId: 'local-1' })
    expect((await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))).status).toBe(200)
  })

  it('does not treat a trial as a subscription', async () => {
    plans.getUserPlan.mockResolvedValue({ ...freePlan(), id: 'pro', definition: PLANS.pro, status: 'trialing', subscriptionId: null })
    const res = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect(res.status).toBe(200)
  })

  it('reuses a recent unpaid checkout for the same Razorpay plan', async () => {
    q.listSubscriptions.mockResolvedValue([subRow({ createdAt: new Date(Date.now() - 5 * 60_000) })])
    rzp.fetchSubscription.mockResolvedValue({
      id: 'sub_old', plan_id: 'plan_pro_m_inr', customer_id: null, status: 'created',
      current_start: null, current_end: null, ended_at: null, charge_at: null, notes: {},
    })
    const res = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect((await res.json()).subscriptionId).toBe('sub_old')
    expect(rzp.createSubscription).not.toHaveBeenCalled()
    expect(q.insertPendingSubscription).not.toHaveBeenCalled()
  })

  it('creates a new subscription when the old checkout is stale or no longer unpaid', async () => {
    q.listSubscriptions.mockResolvedValue([subRow({ createdAt: new Date(Date.now() - 5 * 60_000) })])
    rzp.fetchSubscription.mockResolvedValue({
      id: 'sub_old', plan_id: 'plan_pro_m_inr', customer_id: null, status: 'expired',
      current_start: null, current_end: null, ended_at: null, charge_at: null, notes: {},
    })
    const res = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect((await res.json()).subscriptionId).toBe('sub_new')

    q.listSubscriptions.mockResolvedValue([subRow({ createdAt: new Date(Date.now() - 2 * 60 * 60_000) })])
    rzp.fetchSubscription.mockClear()
    await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect(rzp.fetchSubscription).not.toHaveBeenCalled()
  })

  it('maps Razorpay failures to 502 upstream_error', async () => {
    rzp.createSubscription.mockRejectedValue(new RazorpayError('bad', 400, 'BAD_REQUEST_ERROR', 'plan does not exist'))
    const res = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('upstream_error')
  })

  it('rate limits rapid repeated checkouts', async () => {
    let last: Response | null = null
    for (let i = 0; i < 9; i++) last = await POST(req({ plan: 'pro', interval: 'month', currency: 'INR' }))
    expect(last!.status).toBe(429)
    expect((await last!.json()).code).toBe('rate_limited')
    expect(last!.headers.get('Retry-After')).toBeTruthy()
  })
})
