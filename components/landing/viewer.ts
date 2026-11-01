import { headers } from 'next/headers'
import { auth } from '@/auth'
import { getUserPlan } from '@/lib/plans'
import { detectCurrency } from '@/lib/billing/currency'
import type { Currency } from '@/lib/billing/catalog'
import type { PricingViewer } from '@/components/landing/pricing/pricing-logic'

export interface MarketingContext {
  viewer: PricingViewer
  /** The visitor's currency: their subscription's, else their country's. */
  currency: Currency
}

/**
 * Who is looking at a marketing page, for pricing buttons and the header.
 * Never throws: a database hiccup falls back to treating the viewer as Free.
 */
export async function getMarketingContext(): Promise<MarketingContext> {
  const detected = detectCurrency(headers())
  const session = await auth().catch(() => null)
  const userId = session?.user?.id
  if (!userId) return { viewer: { signedIn: false }, currency: detected }

  try {
    const plan = await getUserPlan(userId)
    return {
      viewer: { signedIn: true, plan: plan.id, status: plan.status, interval: plan.interval },
      currency: plan.currency ?? detected,
    }
  } catch {
    return { viewer: { signedIn: true, plan: 'free', status: 'free', interval: null }, currency: detected }
  }
}
