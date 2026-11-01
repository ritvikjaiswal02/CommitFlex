import { z } from 'zod'
import { getUserPlan } from '@/lib/plans'
import { fetchSubscription, type RazorpaySubscription } from '@/lib/billing/razorpay'
import { upsertSubscriptionFromRazorpay } from '@/lib/billing/sync'
import { verifyCheckoutSignature } from '@/lib/billing/verify'
import { getSubscriptionByRazorpayId } from '@/lib/db/queries/billing'
import type { SubscriptionRow } from '@/lib/db/schema'
import { getSessionUser, invalidRequest, jsonError, readJson, unauthorized } from '../_lib/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VerifySchema = z.object({
  razorpay_payment_id: z.string().trim().min(1).max(64),
  razorpay_subscription_id: z.string().trim().min(1).max(64),
  razorpay_signature: z.string().trim().min(1).max(256),
})

/**
 * POST /api/billing/verify
 * Called by Razorpay Checkout's success handler. Verifies the signature,
 * records the subscription as authenticated or active and applies the plan
 * right away. Any other live subscription of the user is cancelled by
 * upsertSubscriptionFromRazorpay.
 */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const parsed = VerifySchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error, 'The payment confirmation is incomplete.')
  const { razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } =
    parsed.data

  if (!verifyCheckoutSignature({ paymentId, subscriptionId, signature })) {
    return jsonError(400, 'invalid_signature', "We couldn't confirm this payment with Razorpay. If you were charged, your plan updates within a few minutes.")
  }

  const local = await getSubscriptionByRazorpayId(subscriptionId)
  if (!local || local.userId !== user.id) {
    return jsonError(404, 'not_found', 'That subscription is not linked to your account.')
  }

  try {
    const remote = await loadRemote(local)
    // The signature proves the payment was authorised. Razorpay can still
    // report 'created' for a moment after Checkout closes; don't wait for it.
    const confirmed: RazorpaySubscription =
      remote.status === 'created' ? { ...remote, status: 'authenticated' } : remote

    await upsertSubscriptionFromRazorpay(confirmed, { userId: user.id, paymentId })
    const plan = await getUserPlan(user.id)
    return Response.json({ ok: true, plan: plan.id, status: plan.status })
  } catch (err) {
    console.error('[billing] verify failed', err)
    return jsonError(500, 'internal_error', 'Your payment went through but we could not update your plan yet. It updates within a few minutes.')
  }
}

/**
 * Fetches the subscription from Razorpay. When Razorpay is unreachable we
 * still apply the plan from the verified signature, using the local row.
 * The webhook brings the exact period dates later.
 */
async function loadRemote(local: SubscriptionRow): Promise<RazorpaySubscription> {
  try {
    return await fetchSubscription(local.razorpaySubscriptionId)
  } catch (err) {
    console.warn('[billing] verify: could not fetch subscription, using local row', err)
    return {
      id: local.razorpaySubscriptionId,
      plan_id: local.razorpayPlanId,
      customer_id: local.razorpayCustomerId,
      status: 'authenticated',
      current_start: local.currentPeriodStart ? Math.floor(local.currentPeriodStart.getTime() / 1000) : null,
      current_end: local.currentPeriodEnd ? Math.floor(local.currentPeriodEnd.getTime() / 1000) : null,
      ended_at: null,
      charge_at: null,
      notes: { userId: local.userId, plan: local.plan, interval: local.interval, currency: local.currency },
    }
  }
}
