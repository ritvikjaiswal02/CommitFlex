/**
 * Keeps local subscription rows in step with Razorpay. Server-only.
 *
 * Two entry points:
 * - upsertSubscriptionFromRazorpay: after checkout verification or a fetch.
 * - applyWebhookEvent: idempotent webhook processing keyed by x-razorpay-event-id.
 */
import type { SubscriptionRow } from '@/lib/db/schema'
import {
  disableRepoAutopilot,
  forceReviewApprovalMode,
  getSubscriptionByRazorpayId,
  insertSubscription,
  listAutopilotRepos,
  listSubscriptions,
  claimBillingEvent,
  markBillingEventProcessed,
  recordBillingEvent,
  updateSubscription,
  userExists,
} from '@/lib/db/queries/billing'
import { getUserPlan } from '@/lib/plans'
import {
  isBillingInterval,
  isCurrency,
  isPaidPlanId,
  limitFor,
  planHasFeature,
  planRank,
  type BillingInterval,
  type Currency,
  type PaidPlanId,
} from './catalog'
import { isEntitledRow, LIVE_STATUSES } from './entitlement'
import { resolveRazorpayPlanId } from './plan-map'
import { cancelSubscription, fromUnix, type RazorpaySubscription } from './razorpay'

const KNOWN_STATUSES = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'paused',
  'expired',
] as const

/** Statuses Razorpay never leaves. A late event must not resurrect them. */
const TERMINAL_STATUSES = new Set<string>(['cancelled', 'completed', 'expired'])

/** Razorpay status → our stored status. Unknown values are treated as 'created'. */
export function mapRazorpayStatus(status: string): SubscriptionRow['status'] {
  const s = (status ?? '').toLowerCase()
  return (KNOWN_STATUSES as readonly string[]).includes(s) ? s : 'created'
}

function planFromNotes(notes: Record<string, string>): { plan: PaidPlanId; interval: BillingInterval; currency: Currency } | null {
  const plan = notes.plan
  const interval = notes.interval
  const currency = notes.currency
  if (isPaidPlanId(plan) && isBillingInterval(interval) && isCurrency(currency)) return { plan, interval, currency }
  return null
}

function normaliseNotes(notes: unknown): Record<string, string> {
  if (!notes || Array.isArray(notes) || typeof notes !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(notes as Record<string, unknown>)) {
    if (v !== null && v !== undefined) out[k] = String(v)
  }
  return out
}

/**
 * Period end to store. For a cancelled subscription, Razorpay's `ended_at` is
 * when access actually stopped: the cancel time for an immediate cancel, the
 * cycle end for a cancel-at-cycle-end. Use the earlier of the two so an
 * immediate cancel never keeps granting the rest of the period.
 */
function periodEndFor(sub: RazorpaySubscription, status: string): Date | null {
  const currentEnd = fromUnix(sub.current_end)
  if (status !== 'cancelled' && status !== 'completed' && status !== 'expired') return currentEnd
  const endedAt = fromUnix(sub.ended_at)
  if (endedAt && currentEnd) return endedAt.getTime() < currentEnd.getTime() ? endedAt : currentEnd
  return endedAt ?? currentEnd
}

/**
 * Creates or updates the local row for a Razorpay subscription.
 * When the row is live (authenticated, active or pending), every other
 * entitled subscription of the user is cancelled immediately, at Razorpay
 * (best-effort) and locally, so a user never pays for two plans.
 */
export async function upsertSubscriptionFromRazorpay(
  sub: RazorpaySubscription,
  ctx: { userId: string; paymentId?: string },
): Promise<SubscriptionRow> {
  const notes = normaliseNotes(sub.notes)
  const existing = await getSubscriptionByRazorpayId(sub.id)
  if (existing && existing.userId !== ctx.userId) {
    throw new Error(`Subscription ${sub.id} belongs to a different user`)
  }

  const incoming = mapRazorpayStatus(sub.status)
  const status = existing && TERMINAL_STATUSES.has(existing.status) && !TERMINAL_STATUSES.has(incoming)
    ? existing.status
    : incoming
  const resolved = resolveRazorpayPlanId(sub.plan_id) ?? planFromNotes(notes)
  const now = new Date()

  const fields = {
    status,
    razorpayPlanId: sub.plan_id || existing?.razorpayPlanId || '',
    razorpayCustomerId: sub.customer_id ?? existing?.razorpayCustomerId ?? null,
    currentPeriodStart: fromUnix(sub.current_start) ?? existing?.currentPeriodStart ?? null,
    currentPeriodEnd: periodEndFor(sub, status) ?? existing?.currentPeriodEnd ?? null,
    lastPaymentId: ctx.paymentId ?? existing?.lastPaymentId ?? null,
    cancelledAt: status === 'cancelled' ? existing?.cancelledAt ?? fromUnix(sub.ended_at) ?? now : existing?.cancelledAt ?? null,
  }

  let row: SubscriptionRow
  if (existing) {
    // Keep a locally shortened period (immediate cancel) from being extended again.
    if (
      status === 'cancelled' &&
      existing.status === 'cancelled' &&
      existing.currentPeriodEnd &&
      fields.currentPeriodEnd &&
      existing.currentPeriodEnd.getTime() < fields.currentPeriodEnd.getTime()
    ) {
      fields.currentPeriodEnd = existing.currentPeriodEnd
    }
    row = await updateSubscription(existing.id, {
      ...fields,
      ...(resolved ? { plan: resolved.plan, interval: resolved.interval, currency: resolved.currency } : {}),
    })
  } else {
    if (!resolved) throw new Error(`Unknown Razorpay plan ${sub.plan_id} for subscription ${sub.id}`)
    row = await insertSubscription({
      userId: ctx.userId,
      provider: 'razorpay',
      plan: resolved.plan,
      interval: resolved.interval,
      currency: resolved.currency,
      razorpaySubscriptionId: sub.id,
      ...fields,
    })
  }

  if ((LIVE_STATUSES as readonly string[]).includes(row.status)) {
    await cancelOtherEntitled(ctx.userId, row.id)
  }
  return row
}

async function cancelOtherEntitled(userId: string, keepId: string): Promise<void> {
  const now = new Date()
  const others = (await listSubscriptions(userId)).filter((r) => r.id !== keepId && isEntitledRow(r, now))
  for (const other of others) {
    try {
      await cancelSubscription(other.razorpaySubscriptionId, { atCycleEnd: false })
    } catch (err) {
      // Already cancelled at Razorpay, or Razorpay is unreachable. The local
      // row is still cancelled below so entitlements stay correct.
      console.warn('[billing] could not cancel superseded subscription', other.razorpaySubscriptionId, err)
    }
    await updateSubscription(other.id, {
      status: 'cancelled',
      cancelledAt: now,
      currentPeriodEnd: now,
      cancelAtPeriodEnd: false,
    })
  }
}

export interface RazorpayWebhookEvent {
  event: string
  payload: {
    subscription?: { entity: RazorpaySubscription }
    payment?: { entity: { id: string; status: string; error_description?: string | null } }
  }
  created_at: number
}

export type WebhookKind = 'activated' | 'charged' | 'payment_failed' | 'cancelled' | 'halted' | 'other'

export function webhookKind(event: string): WebhookKind {
  switch (event) {
    case 'subscription.activated':
      return 'activated'
    case 'subscription.charged':
      return 'charged'
    case 'subscription.pending':
      return 'payment_failed'
    case 'subscription.cancelled':
      return 'cancelled'
    case 'subscription.halted':
      return 'halted'
    default:
      return 'other'
  }
}

/**
 * Applies one webhook event idempotently.
 * - The event is logged in billing_events; a repeat of an already processed
 *   event id returns `duplicate: true` and changes nothing. An event that
 *   failed earlier is processed again on Razorpay's retry.
 * - The user comes from the local row, else from `notes.userId` (only when
 *   that user exists here; the Razorpay account may serve other products).
 * - A downgrade triggers enforcePlanLimits.
 * Throws on unexpected errors so the route can return 5xx and Razorpay retries.
 */
export async function applyWebhookEvent(
  eventId: string,
  event: RazorpayWebhookEvent,
): Promise<{ handled: boolean; duplicate: boolean; userId: string | null; kind: WebhookKind }> {
  const kind = webhookKind(event.event)
  const { row: logRow, created } = await recordBillingEvent({
    eventId,
    type: event.event.slice(0, 60),
    payload: event as unknown as Record<string, unknown>,
  })
  if (!created && logRow.processedAt) {
    return { handled: false, duplicate: true, userId: logRow.userId, kind }
  }
  // Razorpay redelivers on timeouts, sometimes while the first delivery is
  // still running. Only the delivery holding the claim processes the event.
  if (!(await claimBillingEvent(logRow.id))) {
    return { handled: false, duplicate: true, userId: logRow.userId, kind }
  }

  try {
    const sub = event.payload?.subscription?.entity
    if (!sub?.id) {
      await markBillingEventProcessed(logRow.id, {})
      return { handled: false, duplicate: false, userId: null, kind }
    }

    const local = await getSubscriptionByRazorpayId(sub.id)
    let userId: string | null = local?.userId ?? null
    if (!userId) {
      const candidate = normaliseNotes(sub.notes).userId
      if (candidate && (await userExists(candidate))) userId = candidate
    }
    const ours = !!local || resolveRazorpayPlanId(sub.plan_id) !== null || planFromNotes(normaliseNotes(sub.notes)) !== null
    if (!userId || !ours) {
      // Processed (so retries are no-ops) with a note: nothing here can fix it.
      await markBillingEventProcessed(logRow.id, {
        error: 'Subscription does not belong to a CommitFlex user',
        processed: true,
      })
      return { handled: false, duplicate: false, userId: null, kind }
    }

    const before = await getUserPlan(userId)
    await upsertSubscriptionFromRazorpay(sub, { userId, paymentId: event.payload.payment?.entity?.id })
    const after = await getUserPlan(userId)
    if (planRank(after.id) < planRank(before.id)) {
      await enforcePlanLimits(userId)
    }

    await markBillingEventProcessed(logRow.id, { userId })
    return { handled: true, duplicate: false, userId, kind }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await markBillingEventProcessed(logRow.id, { error: message.slice(0, 1000) })
    } catch (logErr) {
      console.error('[billing] could not record webhook failure', logErr)
    }
    throw err
  }
}

/**
 * Brings a user's settings within their current plan without deleting data:
 * - repos beyond the `repos` limit get autopilot_enabled = false, newest first
 * - approval mode 'auto' falls back to 'review' when the plan lacks it
 */
export async function enforcePlanLimits(userId: string): Promise<void> {
  const plan = await getUserPlan(userId)
  const max = limitFor(plan.id, 'repos')
  const active = await listAutopilotRepos(userId) // oldest first
  if (active.length > max) {
    await disableRepoAutopilot(active.slice(max).map((r) => r.id))
  }
  if (!planHasFeature(plan.id, 'publish.auto_approve')) {
    await forceReviewApprovalMode(userId)
  }
}
