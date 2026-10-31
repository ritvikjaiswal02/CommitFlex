/**
 * Entitlements. Server-only (imports the database through the query layer).
 * Client components import plan data from `@/lib/billing/catalog` instead.
 *
 * The server is the source of truth for every plan check. Locked features and
 * reached limits throw `PlanError`, which routes turn into a 402 with a
 * `PlanErrorBody` via `planErrorToResponse`.
 */
import {
  LIMIT_KEYS,
  PLANS,
  featureLockedMessage,
  limitFor,
  limitReachedMessage,
  planHasFeature,
  requiredPlanFor,
  requiredPlanForLimit,
  isPaidPlanId,
  isCurrency,
  isBillingInterval,
  type BillingInterval,
  type Currency,
  type FeatureKey,
  type LimitKey,
  type PaidPlanId,
  type PlanDefinition,
  type PlanErrorBody,
  type PlanId,
  type PlanStatus,
} from '@/lib/billing/catalog'
import { entitledStatus } from '@/lib/billing/entitlement'
import {
  countUsage,
  getEntitledSubscription,
  getTrialEndsAt,
  incrementUsageCounter,
  releaseUsageCounter,
  reserveUsageCounter,
} from '@/lib/db/queries/billing'

export * from '@/lib/billing/catalog'

export interface Plan {
  /** Effective plan: a running trial resolves to 'pro'. */
  id: PlanId
  definition: PlanDefinition
  status: PlanStatus
  interval: BillingInterval | null
  currency: Currency | null
  currentPeriodEnd: Date | null
  trialEndsAt: Date | null
  /** subscriptions.id of the entitled row. */
  subscriptionId: string | null
  /** True when the entitled subscription will not renew. Optional so test fixtures can omit it. */
  cancelAtPeriodEnd?: boolean
}

/** 'YYYY-MM' in UTC. */
export function currentPeriod(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Resolves the user's effective plan.
 * 1. An entitled subscription (authenticated, active, pending, or cancelled
 *    with time left). Team beats Pro. pending → 'past_due', cancelled or
 *    cancel-at-period-end → 'cancelling'.
 * 2. Otherwise a running trial → Pro, 'trialing'.
 * 3. Otherwise Free.
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const [sub, trialEndsAt] = await Promise.all([getEntitledSubscription(userId), getTrialEndsAt(userId)])

  if (sub && isPaidPlanId(sub.plan)) {
    return {
      id: sub.plan,
      definition: PLANS[sub.plan],
      status: entitledStatus(sub),
      interval: isBillingInterval(sub.interval) ? sub.interval : null,
      currency: isCurrency(sub.currency) ? sub.currency : null,
      currentPeriodEnd: sub.currentPeriodEnd ?? null,
      trialEndsAt,
      subscriptionId: sub.id,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd || sub.status === 'cancelled',
    }
  }

  if (trialEndsAt && trialEndsAt.getTime() > Date.now()) {
    return {
      id: 'pro',
      definition: PLANS.pro,
      status: 'trialing',
      interval: null,
      currency: null,
      currentPeriodEnd: trialEndsAt,
      trialEndsAt,
      subscriptionId: null,
      cancelAtPeriodEnd: false,
    }
  }

  return {
    id: 'free',
    definition: PLANS.free,
    status: 'free',
    interval: null,
    currency: null,
    currentPeriodEnd: null,
    trialEndsAt,
    subscriptionId: null,
    cancelAtPeriodEnd: false,
  }
}

export async function hasFeature(userId: string, key: FeatureKey): Promise<boolean> {
  const plan = await getUserPlan(userId)
  return planHasFeature(plan.id, key)
}

export class PlanError extends Error {
  readonly status = 402 as const
  readonly body: PlanErrorBody

  constructor(body: PlanErrorBody) {
    super(body.error)
    this.name = 'PlanError'
    this.body = body
  }
}

export function isPlanError(err: unknown): err is PlanError {
  if (err instanceof PlanError) return true
  // Duck-type as well, in case two module instances exist (tests, HMR).
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: unknown }).name === 'PlanError' &&
    (err as { status?: unknown }).status === 402 &&
    typeof (err as { body?: unknown }).body === 'object'
  )
}

/** Builds the 402 body for a locked feature without throwing. */
export function featureLockedBody(feature: FeatureKey, currentPlan: PlanId): PlanErrorBody {
  const required = requiredPlanFor(feature)
  const requiredPlan: PaidPlanId = required === 'free' ? 'pro' : required
  return {
    error: featureLockedMessage(feature, requiredPlan),
    code: 'feature_locked',
    feature,
    requiredPlan,
    currentPlan,
  }
}

/** Builds the 402 body for a reached limit without throwing. */
export function limitReachedBody(
  limit: LimitKey,
  used: number,
  max: number,
  currentPlan: PlanId,
  adding = 1,
): PlanErrorBody {
  const requiredPlan = requiredPlanForLimit(limit, Math.max(used + adding, max + 1))
  return {
    error: limitReachedMessage(limit, used, max, requiredPlan),
    code: 'limit_reached',
    limit,
    used,
    max,
    requiredPlan,
    currentPlan,
  }
}

/** Returns the plan, or throws PlanError(feature_locked). */
export async function assertFeature(userId: string, key: FeatureKey): Promise<Plan> {
  const plan = await getUserPlan(userId)
  if (!planHasFeature(plan.id, key)) throw new PlanError(featureLockedBody(key, plan.id))
  return plan
}

/**
 * Checks that `adding` more (default 1) still fits the plan's limit.
 * Throws PlanError(limit_reached) when used + adding > max.
 */
export async function assertWithinLimit(
  userId: string,
  key: LimitKey,
  opts?: { adding?: number },
): Promise<{ plan: Plan; used: number; max: number }> {
  const adding = opts?.adding ?? 1
  const [plan, used] = await Promise.all([getUserPlan(userId), countUsage(userId, key, currentPeriod())])
  const max = limitFor(plan.id, key)
  if (used + adding > max) throw new PlanError(limitReachedBody(key, used, max, plan.id, adding))
  return { plan, used, max }
}

/** Atomically adds to this month's usage counter. Returns the new count. */
export async function recordUsage(userId: string, metric: 'generations', amount = 1): Promise<number> {
  return incrementUsageCounter(userId, metric, currentPeriod(), amount)
}

/**
 * Atomically reserves `amount` generations for this month. Throws
 * PlanError(limit_reached) when that would go over the plan's limit. Call
 * before the expensive work; refund with `refundUsage` if it doesn't happen.
 */
export async function reserveUsage(
  userId: string,
  metric: 'generations' = 'generations',
  amount = 1,
): Promise<{ plan: Plan; count: number; period: string }> {
  const plan = await getUserPlan(userId)
  const max = limitFor(plan.id, 'generationsPerMonth')
  const period = currentPeriod()
  const count = await reserveUsageCounter(userId, metric, period, amount, max)
  if (count === null) {
    const used = await countUsage(userId, 'generationsPerMonth', period)
    throw new PlanError(limitReachedBody('generationsPerMonth', used, max, plan.id, amount))
  }
  return { plan, count, period }
}

/** Returns reserved generations. Best effort: never throws. */
export async function refundUsage(
  userId: string,
  amount: number,
  metric: 'generations' = 'generations',
  period: string = currentPeriod(),
): Promise<void> {
  if (amount <= 0) return
  try {
    await releaseUsageCounter(userId, metric, period, amount)
  } catch (err) {
    console.error('[plans] usage refund failed', err)
  }
}

export interface UsageSnapshot {
  period: string
  items: Record<LimitKey, { used: number; max: number }>
}

/** Usage for every limit in the current period, against the effective plan. */
export async function getUsage(userId: string, planOverride?: Plan): Promise<UsageSnapshot> {
  const period = currentPeriod()
  const [plan, counts] = await Promise.all([
    planOverride ? Promise.resolve(planOverride) : getUserPlan(userId),
    Promise.all(LIMIT_KEYS.map((key) => countUsage(userId, key, period))),
  ])
  const items = {} as Record<LimitKey, { used: number; max: number }>
  LIMIT_KEYS.forEach((key, i) => {
    items[key] = { used: counts[i], max: limitFor(plan.id, key) }
  })
  return { period, items }
}

/** PlanError → 402 JSON response; anything else → null. */
export function planErrorToResponse(err: unknown): Response | null {
  if (!isPlanError(err)) return null
  return Response.json(err.body, { status: 402 })
}

/** Small serializable summary for API responses: `{ id, status }`. */
export function planSummary(plan: Plan): { id: PlanId; name: string; status: PlanStatus; trialEndsAt: string | null } {
  return {
    id: plan.id,
    name: plan.definition.name,
    status: plan.status,
    trialEndsAt: plan.trialEndsAt ? plan.trialEndsAt.toISOString() : null,
  }
}
