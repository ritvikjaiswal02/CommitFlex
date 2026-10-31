/**
 * Builds the billing status payload. Shared by GET /api/billing/status and
 * the /billing server page so both describe the account the same way.
 */
import { getUsage, getUserPlan, type Plan } from '@/lib/plans'
import {
  BILLING_INTERVALS,
  PAID_PLANS,
  type BillingInterval,
  type Currency,
} from '@/lib/billing/catalog'
import { detectCurrency } from '@/lib/billing/currency'
import { availableCurrencies } from '@/lib/billing/plan-map'
import { isConfigured } from '@/lib/env'
import { iso } from './http'
import type { BillingPlanView, BillingStatusResponse, CheckoutAvailability } from '@/components/billing/types'

export type { BillingPlanView, CheckoutAvailability }
export type BillingStatus = BillingStatusResponse

export function toPlanView(plan: Plan): BillingPlanView {
  return {
    id: plan.id,
    name: plan.definition.name,
    status: plan.status,
    interval: plan.interval,
    currency: plan.currency,
    currentPeriodEnd: iso(plan.currentPeriodEnd),
    trialEndsAt: iso(plan.trialEndsAt),
    cancelAtPeriodEnd: plan.cancelAtPeriodEnd ?? plan.status === 'cancelling',
  }
}

export function checkoutAvailability(): CheckoutAvailability {
  const out = {} as CheckoutAvailability
  for (const plan of PAID_PLANS) {
    out[plan] = {} as Record<BillingInterval, Currency[]>
    for (const interval of BILLING_INTERVALS) out[plan][interval] = availableCurrencies(plan, interval)
  }
  return out
}

/**
 * The currency to show first: the one the user already pays in, otherwise
 * the visitor's country (India → INR, everywhere else → USD).
 */
export function suggestCurrency(plan: Plan, headers: Headers): Currency {
  return plan.currency ?? detectCurrency(headers)
}

export async function buildBillingStatus(userId: string, headers: Headers): Promise<BillingStatus> {
  const plan = await getUserPlan(userId)
  const usage = await getUsage(userId, plan)
  return {
    plan: toPlanView(plan),
    usage,
    suggestedCurrency: suggestCurrency(plan, headers),
    configured: isConfigured('razorpay'),
    checkout: checkoutAvailability(),
  }
}
