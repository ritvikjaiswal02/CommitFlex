/**
 * Minimal Razorpay REST client over fetch. Server-only.
 * Docs: https://razorpay.com/docs/api/payments/subscriptions/
 *
 * We deliberately avoid the Razorpay Node SDK: the handful of calls we need
 * are simple JSON over Basic auth, and fetch works in every Next runtime.
 */
import { requireEnv } from '@/lib/env'

const RAZORPAY_API = 'https://api.razorpay.com/v1'
const TIMEOUT_MS = 15_000

export class RazorpayError extends Error {
  status: number
  code?: string
  description?: string

  constructor(message: string, status: number, code?: string, description?: string) {
    super(message)
    this.name = 'RazorpayError'
    this.status = status
    this.code = code
    this.description = description
  }
}

export function isRazorpayError(err: unknown): err is RazorpayError {
  return err instanceof RazorpayError || (!!err && typeof err === 'object' && (err as Error).name === 'RazorpayError')
}

export function getRazorpayKeyId(): string {
  return requireEnv('RAZORPAY_KEY_ID')
}

function authHeader(): string {
  const id = requireEnv('RAZORPAY_KEY_ID')
  const secret = requireEnv('RAZORPAY_KEY_SECRET')
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
}

/**
 * Calls https://api.razorpay.com/v1{path}. Throws RazorpayError with the
 * HTTP status and Razorpay's error code/description on any non-2xx, and with
 * status 502 on network failures or timeouts.
 */
export async function razorpayRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${RAZORPAY_API}${path.startsWith('/') ? path : `/${path}`}`
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Missing env')) throw err
    const reason = err instanceof Error ? err.message : String(err)
    throw new RazorpayError(`Razorpay request failed: ${reason}`, 502, 'network_error')
  }

  const text = await res.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }

  if (!res.ok) {
    const error = (json as { error?: { code?: string; description?: string } } | null)?.error
    const description = error?.description ?? (text.slice(0, 200) || res.statusText)
    throw new RazorpayError(`Razorpay ${method} ${path} failed (${res.status}): ${description}`, res.status, error?.code, description)
  }

  return json as T
}

export interface RazorpaySubscription {
  id: string
  plan_id: string
  customer_id: string | null
  status: string
  /** Unix seconds. */
  current_start: number | null
  current_end: number | null
  ended_at: number | null
  charge_at: number | null
  short_url?: string
  notes: Record<string, string>
}

/** Razorpay returns `notes` as `[]` when empty; normalise to an object. */
function normaliseSubscription(raw: RazorpaySubscription): RazorpaySubscription {
  const notes = raw.notes && !Array.isArray(raw.notes) && typeof raw.notes === 'object' ? raw.notes : {}
  return {
    ...raw,
    customer_id: raw.customer_id ?? null,
    current_start: raw.current_start ?? null,
    current_end: raw.current_end ?? null,
    ended_at: raw.ended_at ?? null,
    charge_at: raw.charge_at ?? null,
    notes,
  }
}

/**
 * Creates a subscription for checkout.
 * totalCount: 120 billing cycles for monthly, 10 for yearly (Razorpay requires a finite count).
 */
export async function createSubscription(input: {
  razorpayPlanId: string
  totalCount: number
  notes: Record<string, string>
  customerNotify?: boolean
}): Promise<RazorpaySubscription> {
  const sub = await razorpayRequest<RazorpaySubscription>('POST', '/subscriptions', {
    plan_id: input.razorpayPlanId,
    total_count: input.totalCount,
    quantity: 1,
    customer_notify: input.customerNotify === false ? 0 : 1,
    notes: input.notes,
  })
  return normaliseSubscription(sub)
}

export function totalCountFor(interval: 'month' | 'year'): number {
  return interval === 'month' ? 120 : 10
}

export async function fetchSubscription(id: string): Promise<RazorpaySubscription> {
  const sub = await razorpayRequest<RazorpaySubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`)
  return normaliseSubscription(sub)
}

/** Cancels now, or at the end of the current billing cycle. */
export async function cancelSubscription(id: string, opts: { atCycleEnd: boolean }): Promise<RazorpaySubscription> {
  const sub = await razorpayRequest<RazorpaySubscription>('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, {
    cancel_at_cycle_end: opts.atCycleEnd ? 1 : 0,
  })
  return normaliseSubscription(sub)
}

export interface RazorpayInvoice {
  id: string
  /** Minor units (paise / cents), as Razorpay returns it. Divide by 100 for display. */
  amount: number
  currency: string
  status: string
  /** Unix seconds. */
  date: number | null
  short_url: string | null
}

interface RazorpayInvoiceRaw {
  id: string
  amount?: number | null
  amount_paid?: number | null
  currency?: string | null
  status?: string | null
  date?: number | null
  issued_at?: number | null
  paid_at?: number | null
  short_url?: string | null
}

/** Invoices for a subscription, newest first. */
export async function listSubscriptionInvoices(subscriptionId: string): Promise<RazorpayInvoice[]> {
  const res = await razorpayRequest<{ items?: RazorpayInvoiceRaw[] }>(
    'GET',
    `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=50`,
  )
  const items = (res?.items ?? []).map((inv) => ({
    id: inv.id,
    amount: Number(inv.amount ?? inv.amount_paid ?? 0),
    currency: inv.currency ?? 'INR',
    status: inv.status ?? 'issued',
    date: inv.paid_at ?? inv.date ?? inv.issued_at ?? null,
    short_url: inv.short_url ?? null,
  }))
  return items.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
}

/** Minor units → major units (49900 → 499). */
export function minorToMajor(amount: number): number {
  return Math.round(amount) / 100
}

/** Unix seconds → Date, or null. */
export function fromUnix(seconds: number | null | undefined): Date | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000)
}
