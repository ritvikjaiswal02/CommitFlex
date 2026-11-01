import { z } from 'zod'
import { getUserPlan } from '@/lib/plans'
import { describeSubscription, priceFor, type Currency } from '@/lib/billing/catalog'
import { detectCurrency } from '@/lib/billing/currency'
import { getRazorpayPlanId } from '@/lib/billing/plan-map'
import {
  createSubscription,
  fetchSubscription,
  getRazorpayKeyId,
  isRazorpayError,
  totalCountFor,
  type RazorpaySubscription,
} from '@/lib/billing/razorpay'
import { insertPendingSubscription, listSubscriptions } from '@/lib/db/queries/billing'
import { isConfigured } from '@/lib/env'
import {
  getSessionUser,
  invalidRequest,
  jsonError,
  rateLimited,
  readJson,
  takeToken,
  unauthorized,
} from '../_lib/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CheckoutSchema = z.object({
  plan: z.enum(['pro', 'team']),
  interval: z.enum(['month', 'year']),
  currency: z.enum(['INR', 'USD']).optional(),
  /** Where the upgrade started (e.g. 'billing', 'upgrade-dialog:drafts.variants'). Stored in notes. */
  source: z.string().trim().max(60).optional(),
})

/** A checkout the user opened but did not pay is reused for this long. */
const REUSE_WINDOW_MS = 30 * 60 * 1000

/**
 * POST /api/billing/checkout
 * Creates (or reuses) a Razorpay subscription for the plan, interval and
 * currency and returns what Razorpay Checkout needs to open.
 */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const parsed = CheckoutSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error, 'Choose a plan (pro or team) and a billing interval (month or year).')
  const { plan, interval, source } = parsed.data

  if (!isConfigured('razorpay')) {
    return jsonError(503, 'not_configured', "Payments aren't set up on this deployment yet.")
  }

  const limit = await takeToken(`checkout:${user.id}`, 8, 60_000)
  if (!limit.ok) return rateLimited(limit.retryAfter)

  const currency: Currency = parsed.data.currency ?? detectCurrency(req.headers)
  const razorpayPlanId = getRazorpayPlanId(plan, interval, currency)
  if (!razorpayPlanId) {
    const other: Currency = currency === 'INR' ? 'USD' : 'INR'
    const alternative = getRazorpayPlanId(plan, interval, other) ? other : null
    return jsonError(
      503,
      'currency_unavailable',
      alternative
        ? `${currency} billing isn't available for this plan yet. Switch to ${alternative} to continue.`
        : "This plan can't be bought right now. Try again later.",
      { currency, alternative },
    )
  }

  try {
    const current = await getUserPlan(user.id)
    if (
      current.subscriptionId &&
      current.id === plan &&
      current.interval === interval &&
      current.status !== 'cancelling'
    ) {
      return jsonError(409, 'already_subscribed', `You're already on ${current.definition.name}, billed ${interval === 'month' ? 'monthly' : 'yearly'}.`)
    }

    const subscription = (await reusableCheckout(user.id, razorpayPlanId)) ?? (await createCheckout(user.id, {
      plan,
      interval,
      currency,
      razorpayPlanId,
      source,
    }))

    return Response.json({
      keyId: getRazorpayKeyId(),
      subscriptionId: subscription.id,
      plan,
      interval,
      currency,
      amount: priceFor(plan, interval, currency),
      name: 'CommitFlex',
      description: describeSubscription(plan, interval),
      prefill: { name: user.name ?? '', email: user.email ?? '' },
    })
  } catch (err) {
    if (isRazorpayError(err)) {
      console.error('[billing] checkout: Razorpay error', err.status, err.code, err.description)
      return jsonError(502, 'upstream_error', "Razorpay didn't accept the checkout request. Try again in a minute.", {
        upstreamStatus: err.status,
      })
    }
    console.error('[billing] checkout failed', err)
    return jsonError(500, 'internal_error', "We couldn't start checkout. Try again in a minute.")
  }
}

/**
 * A subscription this user created for the same Razorpay plan in the last
 * 30 minutes that is still unpaid. Reusing it keeps abandoned checkouts from
 * piling up at Razorpay.
 */
async function reusableCheckout(userId: string, razorpayPlanId: string): Promise<RazorpaySubscription | null> {
  const rows = await listSubscriptions(userId)
  const now = Date.now()
  const candidate = rows.find(
    (r) =>
      r.status === 'created' &&
      r.razorpayPlanId === razorpayPlanId &&
      now - r.createdAt.getTime() < REUSE_WINDOW_MS,
  )
  if (!candidate) return null
  try {
    const remote = await fetchSubscription(candidate.razorpaySubscriptionId)
    return remote.status === 'created' ? remote : null
  } catch {
    return null
  }
}

async function createCheckout(
  userId: string,
  input: { plan: 'pro' | 'team'; interval: 'month' | 'year'; currency: Currency; razorpayPlanId: string; source?: string },
): Promise<RazorpaySubscription> {
  const notes: Record<string, string> = {
    userId,
    plan: input.plan,
    interval: input.interval,
    currency: input.currency,
    app: 'commitflex',
  }
  if (input.source) notes.source = input.source

  const subscription = await createSubscription({
    razorpayPlanId: input.razorpayPlanId,
    totalCount: totalCountFor(input.interval),
    notes,
  })
  await insertPendingSubscription({
    userId,
    plan: input.plan,
    interval: input.interval,
    currency: input.currency,
    razorpaySubscriptionId: subscription.id,
    razorpayPlanId: input.razorpayPlanId,
  })
  return subscription
}
