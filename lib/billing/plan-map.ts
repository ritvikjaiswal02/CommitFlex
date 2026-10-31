/**
 * Maps (plan, interval, currency) to Razorpay plan IDs configured through env:
 * RAZORPAY_PLAN_{PRO|TEAM}_{MONTHLY|YEARLY}_{INR|USD}=plan_...
 * Create the plans in the Razorpay dashboard with the amounts in the catalog.
 */
import { optionalEnv } from '@/lib/env'
import { BILLING_INTERVALS, CURRENCIES, PAID_PLANS, type BillingInterval, type Currency, type PaidPlanId } from './catalog'

export function razorpayPlanEnvName(plan: PaidPlanId, interval: BillingInterval, currency: Currency): string {
  return `RAZORPAY_PLAN_${plan.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'YEARLY'}_${currency}`
}

export function getRazorpayPlanId(plan: PaidPlanId, interval: BillingInterval, currency: Currency): string | null {
  return optionalEnv(razorpayPlanEnvName(plan, interval, currency)) ?? null
}

export function resolveRazorpayPlanId(
  razorpayPlanId: string,
): { plan: PaidPlanId; interval: BillingInterval; currency: Currency } | null {
  if (!razorpayPlanId) return null
  for (const plan of PAID_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      for (const currency of CURRENCIES) {
        if (getRazorpayPlanId(plan, interval, currency) === razorpayPlanId) return { plan, interval, currency }
      }
    }
  }
  return null
}

/** Currencies with at least one plan ID configured for the plan and interval. */
export function availableCurrencies(plan: PaidPlanId, interval: BillingInterval): Currency[] {
  return CURRENCIES.filter((currency) => getRazorpayPlanId(plan, interval, currency) !== null)
}
