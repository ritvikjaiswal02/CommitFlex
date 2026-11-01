import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import {
  RazorpayError,
  cancelSubscription,
  createSubscription,
  fetchSubscription,
  fromUnix,
  getRazorpayKeyId,
  listSubscriptionInvoices,
  minorToMajor,
  razorpayRequest,
  totalCountFor,
} from '@/lib/billing/razorpay'
import { verifyCheckoutSignature, verifyWebhookSignature } from '@/lib/billing/verify'
import { availableCurrencies, getRazorpayPlanId, razorpayPlanEnvName, resolveRazorpayPlanId } from '@/lib/billing/plan-map'
import { detectCountry, detectCurrency } from '@/lib/billing/currency'

const ENV_KEYS = [
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_PLAN_PRO_MONTHLY_INR', 'RAZORPAY_PLAN_PRO_YEARLY_USD', 'RAZORPAY_PLAN_TEAM_MONTHLY_USD',
]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
  process.env.RAZORPAY_KEY_SECRET = 'test_secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec'
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const rawSub = {
  id: 'sub_123',
  plan_id: 'plan_pro_m_inr',
  customer_id: null,
  status: 'created',
  current_start: null,
  current_end: null,
  ended_at: null,
  charge_at: null,
  short_url: 'https://rzp.io/i/abc',
  notes: [],
}

describe('razorpayRequest', () => {
  it('sends Basic auth and JSON to the v1 API', async () => {
    const fetchMock = mockFetch(200, { ok: 1 })
    await razorpayRequest('POST', '/subscriptions', { a: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('rzp_test_key:test_secret').toString('base64')}`)
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ a: 1 })
  })

  it('throws RazorpayError with Razorpay error details', async () => {
    mockFetch(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } })
    const err = await razorpayRequest('GET', '/subscriptions/x').catch((e: RazorpayError) => e) as RazorpayError
    expect(err).toBeInstanceOf(RazorpayError)
    expect(err.status).toBe(400)
    expect(err.code).toBe('BAD_REQUEST_ERROR')
    expect(err.description).toBe('The id provided does not exist')
  })

  it('wraps network failures as 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const err = await razorpayRequest('GET', '/x').catch((e: RazorpayError) => e) as RazorpayError
    expect(err).toBeInstanceOf(RazorpayError)
    expect(err.status).toBe(502)
  })

  it('throws Missing env when keys are unset', async () => {
    delete process.env.RAZORPAY_KEY_SECRET
    mockFetch(200, {})
    await expect(razorpayRequest('GET', '/x')).rejects.toThrow('Missing env RAZORPAY_KEY_SECRET')
    delete process.env.RAZORPAY_KEY_ID
    expect(() => getRazorpayKeyId()).toThrow('Missing env RAZORPAY_KEY_ID')
  })
})

describe('subscription calls', () => {
  it('creates a subscription and normalises empty notes', async () => {
    const fetchMock = mockFetch(200, rawSub)
    const sub = await createSubscription({ razorpayPlanId: 'plan_pro_m_inr', totalCount: totalCountFor('month'), notes: { userId: 'u1' } })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      plan_id: 'plan_pro_m_inr', total_count: 120, quantity: 1, customer_notify: 1, notes: { userId: 'u1' },
    })
    expect(sub.notes).toEqual({})
    expect(sub.id).toBe('sub_123')
    expect(totalCountFor('year')).toBe(10)
  })

  it('fetches and cancels', async () => {
    let fetchMock = mockFetch(200, { ...rawSub, status: 'active' })
    expect((await fetchSubscription('sub_123')).status).toBe('active')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/subscriptions/sub_123')

    fetchMock = mockFetch(200, { ...rawSub, status: 'cancelled' })
    await cancelSubscription('sub_123', { atCycleEnd: true })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/subscriptions/sub_123/cancel')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cancel_at_cycle_end: 1 })
  })

  it('lists invoices newest first', async () => {
    mockFetch(200, {
      items: [
        { id: 'inv_1', amount: 49900, currency: 'INR', status: 'paid', date: 100, short_url: 'https://rzp.io/1' },
        { id: 'inv_2', amount: 49900, currency: 'INR', status: 'paid', date: 200, short_url: null },
      ],
    })
    const invoices = await listSubscriptionInvoices('sub_123')
    expect(invoices.map((i) => i.id)).toEqual(['inv_2', 'inv_1'])
    expect(invoices[1]).toEqual({ id: 'inv_1', amount: 49900, currency: 'INR', status: 'paid', date: 100, short_url: 'https://rzp.io/1' })
    expect(minorToMajor(49900)).toBe(499)
  })

  it('converts unix seconds', () => {
    expect(fromUnix(1_700_000_000)?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
    expect(fromUnix(null)).toBeNull()
    expect(fromUnix(0)).toBeNull()
  })
})

describe('signatures', () => {
  it('verifies webhook HMACs', () => {
    const body = '{"event":"subscription.activated"}'
    const sig = createHmac('sha256', 'whsec').update(body).digest('hex')
    expect(verifyWebhookSignature(body, sig)).toBe(true)
    expect(verifyWebhookSignature(body, sig.toUpperCase())).toBe(true)
    expect(verifyWebhookSignature(body + ' ', sig)).toBe(false)
    expect(verifyWebhookSignature(body, null)).toBe(false)
    expect(verifyWebhookSignature(body, 'short')).toBe(false)
    expect(verifyWebhookSignature(body, createHmac('sha256', 'other').update(body).digest('hex'), 'other')).toBe(true)
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    expect(verifyWebhookSignature(body, sig)).toBe(false)
  })

  it('verifies checkout signatures as paymentId|subscriptionId', () => {
    const signature = createHmac('sha256', 'test_secret').update('pay_1|sub_1').digest('hex')
    expect(verifyCheckoutSignature({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature })).toBe(true)
    expect(verifyCheckoutSignature({ paymentId: 'pay_2', subscriptionId: 'sub_1', signature })).toBe(false)
    expect(verifyCheckoutSignature({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature: '' })).toBe(false)
  })
})

describe('plan map', () => {
  it('reads plan ids from env and resolves them back', () => {
    process.env.RAZORPAY_PLAN_PRO_MONTHLY_INR = 'plan_pro_m_inr'
    process.env.RAZORPAY_PLAN_PRO_YEARLY_USD = 'plan_pro_y_usd'
    process.env.RAZORPAY_PLAN_TEAM_MONTHLY_USD = ''
    expect(razorpayPlanEnvName('team', 'year', 'INR')).toBe('RAZORPAY_PLAN_TEAM_YEARLY_INR')
    expect(getRazorpayPlanId('pro', 'month', 'INR')).toBe('plan_pro_m_inr')
    expect(getRazorpayPlanId('team', 'month', 'USD')).toBeNull()
    expect(resolveRazorpayPlanId('plan_pro_y_usd')).toEqual({ plan: 'pro', interval: 'year', currency: 'USD' })
    expect(resolveRazorpayPlanId('plan_unknown')).toBeNull()
    expect(resolveRazorpayPlanId('')).toBeNull()
    expect(availableCurrencies('pro', 'month')).toEqual(['INR'])
  })
})

describe('currency detection', () => {
  it('uses INR for India and USD elsewhere', () => {
    expect(detectCurrency(new Headers({ 'x-vercel-ip-country': 'IN' }))).toBe('INR')
    expect(detectCurrency(new Headers({ 'x-vercel-ip-country': 'in' }))).toBe('INR')
    expect(detectCurrency(new Headers({ 'x-vercel-ip-country': 'US' }))).toBe('USD')
    expect(detectCurrency(new Headers({ 'cf-ipcountry': 'IN' }))).toBe('INR')
    expect(detectCurrency(new Headers())).toBe('USD')
    expect(detectCountry(new Headers({ 'x-vercel-ip-country': 'DE' }))).toBe('DE')
    expect(detectCountry(new Headers())).toBeNull()
  })
})
