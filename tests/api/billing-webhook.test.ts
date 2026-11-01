import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import type { SubscriptionRow } from '@/lib/db/schema'

const plans = vi.hoisted(() => ({ getUserPlan: vi.fn() }))
const q = vi.hoisted(() => ({ getSubscriptionByRazorpayId: vi.fn() }))
const sync = vi.hoisted(() => ({ applyWebhookEvent: vi.fn() }))
const notify = vi.hoisted(() => ({ sendBillingNotice: vi.fn() }))

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/plans', () => plans)
vi.mock('@/lib/db/queries/billing', () => q)
vi.mock('@/lib/billing/sync', () => sync)
vi.mock('@/app/api/billing/_lib/notify', () => notify)

import { POST } from '@/app/api/webhooks/razorpay/route'

const SECRET = 'whsec_test'
const DAY = 86_400_000

function event(name: string) {
  return {
    entity: 'event',
    event: name,
    payload: {
      subscription: {
        entity: {
          id: 'sub_1', plan_id: 'plan_pro_m_inr', customer_id: 'cust_1', status: 'active',
          current_start: null, current_end: null, ended_at: null, charge_at: null, notes: { userId: 'u1' },
        },
      },
    },
    created_at: 1_790_000_000,
  }
}

function req(body: unknown, opts: { signature?: string | null; eventId?: string | null } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const signature = opts.signature === undefined ? createHmac('sha256', SECRET).update(raw).digest('hex') : opts.signature
  if (signature) headers['x-razorpay-signature'] = signature
  if (opts.eventId !== null) headers['x-razorpay-event-id'] = opts.eventId ?? 'evt_1'
  return new Request('http://localhost/api/webhooks/razorpay', { method: 'POST', headers, body: raw })
}

function subRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  const now = new Date()
  return {
    id: 'local-1', userId: 'u1', provider: 'razorpay', plan: 'pro', interval: 'month', currency: 'INR', status: 'active',
    razorpaySubscriptionId: 'sub_1', razorpayPlanId: 'plan_pro_m_inr', razorpayCustomerId: null, lastPaymentId: null,
    currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, createdAt: now, updatedAt: now,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET
  sync.applyWebhookEvent.mockResolvedValue({ handled: true, duplicate: false, userId: 'u1', kind: 'charged' })
  q.getSubscriptionByRazorpayId.mockResolvedValue(subRow())
  plans.getUserPlan.mockResolvedValue({ id: 'free', status: 'free', subscriptionId: null })
  notify.sendBillingNotice.mockResolvedValue(true)
})

afterEach(() => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET
})

describe('POST /api/webhooks/razorpay', () => {
  it('returns 503 when the webhook secret is not configured', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    const res = await POST(req(event('subscription.charged')))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('not_configured')
  })

  it('rejects a missing or wrong signature', async () => {
    expect((await POST(req(event('subscription.charged'), { signature: null }))).status).toBe(400)
    const res = await POST(req(event('subscription.charged'), { signature: 'a'.repeat(64) }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_signature')
    expect(sync.applyWebhookEvent).not.toHaveBeenCalled()
  })

  it('rejects signed bodies that are not Razorpay events', async () => {
    expect((await POST(req('not json'))).status).toBe(400)
    expect((await POST(req({ hello: 'world' }))).status).toBe(400)
  })

  it('applies the event keyed by x-razorpay-event-id', async () => {
    const body = event('subscription.charged')
    const res = await POST(req(body, { eventId: 'evt_42' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sync.applyWebhookEvent).toHaveBeenCalledWith('evt_42', expect.objectContaining({ event: 'subscription.charged' }))
    expect(notify.sendBillingNotice).not.toHaveBeenCalled()
  })

  it('falls back to a body hash when the event id header is missing', async () => {
    await POST(req(event('subscription.charged'), { eventId: null }))
    expect(sync.applyWebhookEvent.mock.calls[0][0]).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('acknowledges duplicates without side effects', async () => {
    sync.applyWebhookEvent.mockResolvedValue({ handled: false, duplicate: true, userId: 'u1', kind: 'activated' })
    const res = await POST(req(event('subscription.activated')))
    expect(await res.json()).toEqual({ ok: true, duplicate: true })
    expect(notify.sendBillingNotice).not.toHaveBeenCalled()
  })

  it('returns 500 so Razorpay retries when processing throws', async () => {
    sync.applyWebhookEvent.mockRejectedValue(new Error('db down'))
    const res = await POST(req(event('subscription.charged')))
    expect(res.status).toBe(500)
  })

  it('emails the user when a subscription activates', async () => {
    const end = new Date(Date.now() + 30 * DAY)
    q.getSubscriptionByRazorpayId.mockResolvedValue(subRow({ currentPeriodEnd: end }))
    sync.applyWebhookEvent.mockResolvedValue({ handled: true, duplicate: false, userId: 'u1', kind: 'activated' })
    await POST(req(event('subscription.activated')))
    expect(notify.sendBillingNotice).toHaveBeenCalledWith({ userId: 'u1', kind: 'activated', planName: 'Pro', periodEnd: end })
  })

  it('emails on a failed payment', async () => {
    sync.applyWebhookEvent.mockResolvedValue({ handled: true, duplicate: false, userId: 'u1', kind: 'payment_failed' })
    await POST(req(event('subscription.pending')))
    expect(notify.sendBillingNotice).toHaveBeenCalledWith(expect.objectContaining({ kind: 'payment_failed', planName: 'Pro' }))
  })

  it('emails on cancellation with the remaining period', async () => {
    const end = new Date(Date.now() + 5 * DAY)
    q.getSubscriptionByRazorpayId.mockResolvedValue(subRow({ status: 'cancelled', currentPeriodEnd: end }))
    plans.getUserPlan.mockResolvedValue({ id: 'pro', status: 'cancelling', subscriptionId: 'local-1' })
    sync.applyWebhookEvent.mockResolvedValue({ handled: true, duplicate: false, userId: 'u1', kind: 'cancelled' })
    await POST(req(event('subscription.cancelled')))
    expect(notify.sendBillingNotice).toHaveBeenCalledWith({ userId: 'u1', kind: 'cancelled', planName: 'Pro', periodEnd: end })
  })

  it('stays quiet when the cancelled subscription was replaced by an upgrade', async () => {
    q.getSubscriptionByRazorpayId.mockResolvedValue(subRow({ status: 'cancelled' }))
    plans.getUserPlan.mockResolvedValue({ id: 'team', status: 'active', subscriptionId: 'local-team' })
    sync.applyWebhookEvent.mockResolvedValue({ handled: true, duplicate: false, userId: 'u1', kind: 'cancelled' })
    const res = await POST(req(event('subscription.cancelled')))
    expect(res.status).toBe(200)
    expect(notify.sendBillingNotice).not.toHaveBeenCalled()
  })

  it('still acknowledges the event when the email fails', async () => {
    notify.sendBillingNotice.mockRejectedValue(new Error('smtp'))
    sync.applyWebhookEvent.mockResolvedValue({ handled: true, duplicate: false, userId: 'u1', kind: 'activated' })
    const res = await POST(req(event('subscription.activated')))
    expect(res.status).toBe(200)
  })

  it('does not email for events it did not handle', async () => {
    sync.applyWebhookEvent.mockResolvedValue({ handled: false, duplicate: false, userId: null, kind: 'activated' })
    await POST(req(event('subscription.activated')))
    expect(notify.sendBillingNotice).not.toHaveBeenCalled()
  })
})
