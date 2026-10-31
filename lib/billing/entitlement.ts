/**
 * Pure entitlement rules for subscription rows. No database or env access,
 * so both the query layer and the plan resolver share one definition.
 */
import type { SubscriptionRow } from '@/lib/db/schema'
import { isPaidPlanId, planRank, type PaidPlanId, type PlanStatus } from './catalog'

/** Razorpay statuses that grant access on their own. */
export const LIVE_STATUSES = ['authenticated', 'active', 'pending'] as const

type EntitlementFields = Pick<SubscriptionRow, 'status' | 'plan' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'updatedAt'>

/**
 * A row grants its plan when it is authenticated, active or pending, or when
 * it was cancelled but the paid period hasn't ended yet.
 */
export function isEntitledRow(row: EntitlementFields, now: Date = new Date()): boolean {
  if (!isPaidPlanId(row.plan)) return false
  if ((LIVE_STATUSES as readonly string[]).includes(row.status)) return true
  if (row.status === 'cancelled' && row.currentPeriodEnd && row.currentPeriodEnd.getTime() > now.getTime()) return true
  return false
}

/** Status shown to the user for an entitled row. */
export function entitledStatus(row: EntitlementFields): Exclude<PlanStatus, 'free' | 'trialing'> {
  if (row.status === 'pending') return 'past_due'
  if (row.status === 'cancelled' || row.cancelAtPeriodEnd) return 'cancelling'
  return 'active'
}

/**
 * Best entitled row: highest plan first (team > pro), then a live status over
 * a cancelled-but-running one, then the latest period end, then most recent update.
 */
export function pickEntitled<T extends EntitlementFields>(rows: T[], now: Date = new Date()): T | null {
  const entitled = rows.filter((r) => isEntitledRow(r, now))
  if (entitled.length === 0) return null
  return entitled.sort((a, b) => {
    const rank = planRank(b.plan as PaidPlanId) - planRank(a.plan as PaidPlanId)
    if (rank !== 0) return rank
    const liveA = a.status === 'cancelled' ? 0 : 1
    const liveB = b.status === 'cancelled' ? 0 : 1
    if (liveA !== liveB) return liveB - liveA
    const endA = a.currentPeriodEnd?.getTime() ?? 0
    const endB = b.currentPeriodEnd?.getTime() ?? 0
    if (endA !== endB) return endB - endA
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })[0]
}
