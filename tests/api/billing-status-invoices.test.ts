import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SubscriptionRow } from '@/lib/db/schema'
import { PLANS } from '@/lib/billing/catalog'

const authMock = vi.hoisted(() => ({ auth: vi.fn() }))
const plans = vi.hoisted(() => ({ getUserPlan: vi.fn(), getUsage: vi.fn() }))
const q = vi.hoisted(() => ({ listSubscriptions: vi.fn() }))
const rzp = vi.hoisted(() => ({ listSubscriptionInvoices: vi.fn() }))

vi.mock('@/auth', () => authMock)
vi.mock('@/lib/plans', () => plans)
vi.mock('@/lib/db/queries/billing', () => q)
vi.mock('@/lib/billing/razorpay', async (orig) => ({ ...(await orig<typeof import('@/lib/billing/razorpay')>()), ...rzp }))

import { GET as status } from '@/app/api/billing/status/route'
import { GET as invoices } from '@/app/api/billing/invoices/route'

const DAY = 86_400_000

function subRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  const now = new Date()
  return {
    id: 'local-1', userId: 'u1', provider: 'razorpay', plan: 'pro', interval: 'month', currency: 'INR', status: 'active',
    razorpaySubscriptionId: 'sub_1', razorpayPlanId: 'plan_pro_m_inr', razorpayCustomerId: null, lastPaymentId: null,
    currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, createdAt: now, updatedAt: now,
    ...overrides,
  }
}

const usage = {
  period: '2026-11',
  items: {
    repos: { used: 1, max: 10 }, generationsPerMonth: { used: 7, max: 150 }, voiceProfiles: { used: 1, max: 5 },
    queuedPosts: { used: 2, max: 60 }, extensionTokens: { used: 0, max: 5 }, reviewers: { used: 0, max: 0 },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.auth.mockResolvedValue({ user: { id: 'u1' } })
  plans.getUsage.mockResolvedValue(usage)
  process.env.RAZORPAY_KEY_ID = 'rzp_test'
  process.env.RAZORPAY_KEY_SECRET = 'secret'
  process.env.RAZORPAY_PLAN_PRO_MONTHLY_INR = 'plan_pro_m_inr'
})

afterEach(() => {
  delete process.env.RAZORPAY_KEY_ID
  delete process.env.RAZORPAY_KEY_SECRET
  delete process.env.RAZORPAY_PLAN_PRO_MONTHLY_INR
})

describe('GET /api/billing/status', () => {
  it('returns 401 when signed out', async () => {
    authMock.auth.mockResolvedValue(null)
    expect((await status(new Request('http://localhost/api/billing/status'))).status).toBe(401)
  })

  it('describes a trial with the visitor-country currency', async () => {
    const trialEnd = new Date(Date.now() + 9 * DAY)
    plans.getUserPlan.mockResolvedValue({
      id: 'pro', definition: PLANS.pro, status: 'trialing', interval: null, currency: null,
      currentPeriodEnd: trialEnd, trialEndsAt: trialEnd, subscriptionId: null, cancelAtPeriodEnd: false,
    })
    const res = await status(new Request('http://localhost/api/billing/status', { headers: { 'x-vercel-ip-country': 'IN' } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan).toEqual({
      id: 'pro', name: 'Pro', status: 'trialing', interval: null, currency: null,
      currentPeriodEnd: trialEnd.toISOString(), trialEndsAt: trialEnd.toISOString(), cancelAtPeriodEnd: false,
    })
    expect(body.usage).toEqual(usage)
    expect(body.suggestedCurrency).toBe('INR')
    expect(body.configured).toBe(true)
    expect(body.checkout.pro.month).toEqual(['INR'])
    expect(body.checkout.team.year).toEqual([])
    expect(plans.getUsage).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'pro' }))
  })

  it('prefers the currency the user already pays in', async () => {
    plans.getUserPlan.mockResolvedValue({
      id: 'team', definition: PLANS.team, status: 'cancelling', interval: 'year', currency: 'USD',
      currentPeriodEnd: new Date(Date.now() + DAY), trialEndsAt: null, subscriptionId: 's', cancelAtPeriodEnd: true,
    })
    const body = await (await status(new Request('http://localhost/api/billing/status', { headers: { 'x-vercel-ip-country': 'IN' } }))).json()
    expect(body.suggestedCurrency).toBe('USD')
    expect(body.plan.cancelAtPeriodEnd).toBe(true)
  })

  it('reports configured=false without Razorpay keys', async () => {
    delete process.env.RAZORPAY_KEY_SECRET
    plans.getUserPlan.mockResolvedValue({ id: 'free', definition: PLANS.free, status: 'free', interval: null, currency: null, currentPeriodEnd: null, trialEndsAt: null, subscriptionId: null })
    const body = await (await status(new Request('http://localhost/api/billing/status'))).json()
    expect(body.configured).toBe(false)
    expect(body.suggestedCurrency).toBe('USD')
  })

  it('returns 500 with a readable error when the plan lookup fails', async () => {
    plans.getUserPlan.mockRejectedValue(new Error('db down'))
    const res = await status(new Request('http://localhost/api/billing/status'))
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('internal_error')
  })
})

describe('GET /api/billing/invoices', () => {
  it('returns 401 when signed out', async () => {
    authMock.auth.mockResolvedValue(null)
    expect((await invoices()).status).toBe(401)
  })

  it('returns an empty list without paid subscriptions', async () => {
    q.listSubscriptions.mockResolvedValue([subRow({ status: 'created' })])
    const body = await (await invoices()).json()
    expect(body.invoices).toEqual([])
    expect(rzp.listSubscriptionInvoices).not.toHaveBeenCalled()
  })

  it('returns an empty list when Razorpay is not configured', async () => {
    delete process.env.RAZORPAY_KEY_ID
    q.listSubscriptions.mockResolvedValue([subRow()])
    const body = await (await invoices()).json()
    expect(body.invoices).toEqual([])
  })

  it('merges invoices across subscriptions, newest first, in major units', async () => {
    q.listSubscriptions.mockResolvedValue([
      subRow({ id: 'a', razorpaySubscriptionId: 'sub_team', plan: 'team', interval: 'year' }),
      subRow({ id: 'b', razorpaySubscriptionId: 'sub_pro', status: 'cancelled' }),
    ])
    rzp.listSubscriptionInvoices.mockImplementation(async (id: string) =>
      id === 'sub_team'
        ? [{ id: 'inv_2', amount: 1999000, currency: 'INR', status: 'paid', date: 1_790_000_000, short_url: 'https://rzp.io/i/2' }]
        : [
            { id: 'inv_1', amount: 49900, currency: 'INR', status: 'paid', date: 1_780_000_000, short_url: null },
            { id: 'inv_2', amount: 1999000, currency: 'INR', status: 'paid', date: 1_790_000_000, short_url: 'https://rzp.io/i/2' },
          ],
    )
    const body = await (await invoices()).json()
    expect(body.invoices).toEqual([
      { id: 'inv_2', amount: 19990, currency: 'INR', status: 'paid', date: new Date(1_790_000_000_000).toISOString(), url: 'https://rzp.io/i/2', description: 'Team, yearly' },
      { id: 'inv_1', amount: 499, currency: 'INR', status: 'paid', date: new Date(1_780_000_000_000).toISOString(), url: null, description: 'Pro, monthly' },
    ])
    expect(body.partial).toBe(false)
  })

  it('returns what it can when one subscription fails, and 502 when all fail', async () => {
    q.listSubscriptions.mockResolvedValue([
      subRow({ id: 'a', razorpaySubscriptionId: 'sub_a' }),
      subRow({ id: 'b', razorpaySubscriptionId: 'sub_b' }),
    ])
    rzp.listSubscriptionInvoices.mockImplementation(async (id: string) => {
      if (id === 'sub_b') throw new Error('timeout')
      return [{ id: 'inv_a', amount: 900, currency: 'USD', status: 'paid', date: 1_780_000_000, short_url: null }]
    })
    const partial = await (await invoices()).json()
    expect(partial.invoices).toHaveLength(1)
    expect(partial.invoices[0].amount).toBe(9)
    expect(partial.invoices[0].currency).toBe('USD')
    expect(partial.partial).toBe(true)

    rzp.listSubscriptionInvoices.mockRejectedValue(new Error('down'))
    const res = await invoices()
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('upstream_error')
  })
})
