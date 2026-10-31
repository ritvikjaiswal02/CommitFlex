/**
 * Serializable billing shapes shared by the billing API routes and the
 * billing UI. Client-safe: type-only, no server imports.
 */
import type { BillingInterval, Currency, LimitKey, PaidPlanId, PlanId, PlanStatus } from '@/lib/billing/catalog'

export interface BillingPlanView {
  id: PlanId
  name: string
  status: PlanStatus
  interval: BillingInterval | null
  currency: Currency | null
  /** ISO. For a trial this is the trial end. */
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
}

export interface UsageView {
  /** 'YYYY-MM' (UTC). */
  period: string
  items: Record<LimitKey, { used: number; max: number }>
}

/** Currencies that can be charged for each paid plan and interval. */
export type CheckoutAvailability = Record<PaidPlanId, Record<BillingInterval, Currency[]>>

/** GET /api/billing/status */
export interface BillingStatusResponse {
  plan: BillingPlanView
  usage: UsageView
  suggestedCurrency: Currency
  configured: boolean
  checkout: CheckoutAvailability
}

/** One row of GET /api/billing/invoices */
export interface InvoiceView {
  id: string
  /** Major units (499, 9). */
  amount: number
  currency: Currency
  status: string
  /** ISO date of payment or issue. */
  date: string | null
  /** Razorpay-hosted invoice page. */
  url: string | null
  /** 'Pro, monthly' */
  description: string
}

/** POST /api/billing/checkout (200) */
export interface CheckoutResponse {
  keyId: string
  subscriptionId: string
  plan: PaidPlanId
  interval: BillingInterval
  currency: Currency
  amount: number
  name: string
  description: string
  prefill: { name: string; email: string }
}
