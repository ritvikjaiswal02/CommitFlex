import { createHash } from 'crypto'
import { getUserPlan } from '@/lib/plans'
import { PLANS, isPaidPlanId } from '@/lib/billing/catalog'
import { applyWebhookEvent, type RazorpayWebhookEvent } from '@/lib/billing/sync'
import { verifyWebhookSignature } from '@/lib/billing/verify'
import { getSubscriptionByRazorpayId } from '@/lib/db/queries/billing'
import { optionalEnv } from '@/lib/env'
import { jsonError } from '@/app/api/billing/_lib/http'
import { sendBillingNotice, type BillingNoticeKind } from '@/app/api/billing/_lib/notify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Razorpay bodies are small; anything bigger is not a Razorpay event. */
const MAX_BODY_BYTES = 256 * 1024

const NOTIFY_KINDS = new Set<BillingNoticeKind>(['activated', 'payment_failed', 'cancelled'])

function isWebhookEvent(value: unknown): value is RazorpayWebhookEvent {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.event === 'string' && !!v.payload && typeof v.payload === 'object'
}

/**
 * POST /api/webhooks/razorpay
 * Subscription lifecycle events (activated, charged, pending, halted,
 * cancelled, completed, paused, resumed). Verified with
 * RAZORPAY_WEBHOOK_SECRET and processed once per x-razorpay-event-id.
 *
 * Returns 5xx only for unexpected failures, so Razorpay retries them.
 */
export async function POST(req: Request) {
  const secret = optionalEnv('RAZORPAY_WEBHOOK_SECRET')
  if (!secret) return jsonError(503, 'not_configured', 'Razorpay webhooks are not configured.')

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return jsonError(413, 'payload_too_large', 'Payload too large.')

  const signature = req.headers.get('x-razorpay-signature')
  if (!verifyWebhookSignature(raw, signature, secret)) {
    return jsonError(400, 'invalid_signature', 'Signature verification failed.')
  }

  let event: unknown
  try {
    event = JSON.parse(raw)
  } catch {
    return jsonError(400, 'invalid_request', 'Body is not valid JSON.')
  }
  if (!isWebhookEvent(event)) return jsonError(400, 'invalid_request', 'Not a Razorpay event.')

  // Razorpay sends a unique id per event. If a proxy strips it, the body hash
  // still dedupes exact redeliveries.
  const eventId =
    req.headers.get('x-razorpay-event-id')?.trim() || `sha256:${createHash('sha256').update(raw).digest('hex').slice(0, 64)}`

  let result: Awaited<ReturnType<typeof applyWebhookEvent>>
  try {
    result = await applyWebhookEvent(eventId, event)
  } catch (err) {
    console.error('[billing] webhook processing failed', event.event, eventId, err)
    return jsonError(500, 'internal_error', 'Event could not be processed. Razorpay will retry.')
  }

  if (result.duplicate) return Response.json({ ok: true, duplicate: true })

  if (result.handled && result.userId && NOTIFY_KINDS.has(result.kind as BillingNoticeKind)) {
    await notify(result.userId, result.kind as BillingNoticeKind, event)
  }

  return Response.json({ ok: true })
}

/**
 * Sends the user-facing email for an event. Skips the "cancelled" email when
 * the cancellation is the old plan being replaced by an upgrade.
 */
async function notify(userId: string, kind: BillingNoticeKind, event: RazorpayWebhookEvent): Promise<void> {
  try {
    const rzpId = event.payload.subscription?.entity?.id
    const row = rzpId ? await getSubscriptionByRazorpayId(rzpId) : null
    if (!row || !isPaidPlanId(row.plan)) return
    const planName = PLANS[row.plan].name

    if (kind === 'cancelled') {
      const current = await getUserPlan(userId)
      const replaced = current.subscriptionId !== null && current.subscriptionId !== row.id
      if (replaced) return
      const periodEnd = row.currentPeriodEnd && row.currentPeriodEnd.getTime() > Date.now() ? row.currentPeriodEnd : null
      await sendBillingNotice({ userId, kind, planName, periodEnd })
      return
    }

    await sendBillingNotice({ userId, kind, planName, periodEnd: row.currentPeriodEnd })
  } catch (err) {
    console.error('[billing] webhook notice failed', kind, err)
  }
}
