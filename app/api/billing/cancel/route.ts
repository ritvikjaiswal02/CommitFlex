import { z } from 'zod'
import { cancelSubscription, fromUnix, isRazorpayError } from '@/lib/billing/razorpay'
import { enforcePlanLimits } from '@/lib/billing/sync'
import { getEntitledSubscription, updateSubscription } from '@/lib/db/queries/billing'
import type { SubscriptionRow } from '@/lib/db/schema'
import { getSessionUser, invalidRequest, iso, jsonError, readJson, unauthorized } from '../_lib/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CancelSchema = z.object({
  /** true (default): keep access until the end of the paid period. false: end it now. */
  atPeriodEnd: z.boolean().optional().default(true),
})

function done(row: Pick<SubscriptionRow, 'cancelAtPeriodEnd' | 'currentPeriodEnd'>) {
  return Response.json({ ok: true, cancelAtPeriodEnd: row.cancelAtPeriodEnd, currentPeriodEnd: iso(row.currentPeriodEnd) })
}

/**
 * POST /api/billing/cancel
 * Cancels the user's paid subscription, by default at the end of the period.
 * Access continues until current_period_end, then getUserPlan falls back to Free.
 */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const parsed = CancelSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error)
  const { atPeriodEnd } = parsed.data

  const sub = await getEntitledSubscription(user.id)
  if (!sub) return jsonError(404, 'no_subscription', "You don't have a paid subscription to cancel.")

  try {
    // Already cancelled at Razorpay and running out the paid period.
    if (sub.status === 'cancelled') {
      if (atPeriodEnd) return done({ cancelAtPeriodEnd: true, currentPeriodEnd: sub.currentPeriodEnd })
      const now = new Date()
      const row = await updateSubscription(sub.id, { currentPeriodEnd: now, cancelAtPeriodEnd: false })
      await enforcePlanLimits(user.id)
      return done(row)
    }

    if (atPeriodEnd && sub.cancelAtPeriodEnd) return done(sub)

    if (atPeriodEnd) {
      try {
        const remote = await cancelSubscription(sub.razorpaySubscriptionId, { atCycleEnd: true })
        const row = await updateSubscription(sub.id, {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: fromUnix(remote.current_end) ?? sub.currentPeriodEnd,
        })
        return done(row)
      } catch (err) {
        // Razorpay only cancels at cycle end once a cycle has started. A
        // subscription that is authenticated but not yet charged is ended now;
        // any period already paid for is kept.
        if (!(isRazorpayError(err) && err.status === 400 && sub.status === 'authenticated')) throw err
        await cancelSubscription(sub.razorpaySubscriptionId, { atCycleEnd: false })
        const now = new Date()
        const keepUntil = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now
        const row = await updateSubscription(sub.id, {
          status: 'cancelled',
          cancelledAt: now,
          currentPeriodEnd: keepUntil,
          cancelAtPeriodEnd: keepUntil > now,
        })
        if (keepUntil <= now) await enforcePlanLimits(user.id)
        return done(row)
      }
    }

    await cancelSubscription(sub.razorpaySubscriptionId, { atCycleEnd: false })
    const now = new Date()
    const row = await updateSubscription(sub.id, {
      status: 'cancelled',
      cancelledAt: now,
      currentPeriodEnd: now,
      cancelAtPeriodEnd: false,
    })
    await enforcePlanLimits(user.id)
    return done(row)
  } catch (err) {
    if (isRazorpayError(err)) {
      console.error('[billing] cancel: Razorpay error', err.status, err.code, err.description)
      return jsonError(502, 'upstream_error', "Razorpay didn't accept the cancellation, so nothing changed. Try again in a minute.", {
        upstreamStatus: err.status,
      })
    }
    console.error('[billing] cancel failed', err)
    return jsonError(500, 'internal_error', "We couldn't cancel your subscription. Try again in a minute.")
  }
}
