import type { Metadata } from 'next'
import { MarketingShell } from '@/components/landing/marketing-shell'
import { Container, Section } from '@/components/landing/section'
import { PricingTable } from '@/components/landing/pricing/pricing-table'
import { CompareTable } from '@/components/landing/pricing/compare-table'
import { PRICING_FAQ } from '@/components/landing/pricing/pricing-faq'
import { FaqList } from '@/components/landing/faq'
import { CtaBand } from '@/components/landing/cta-band'
import { getMarketingContext } from '@/components/landing/viewer'
import {
  resolveCurrency,
  resolveFocusPlan,
  resolveInterval,
} from '@/components/landing/pricing/pricing-logic'
import { PLANS, TRIAL_DAYS, formatPrice } from '@/lib/billing/catalog'

export const metadata: Metadata = {
  title: 'Pricing',
  description: `Free for one repo. Pro is ${formatPrice(PLANS.pro.prices.INR.month, 'INR')} or ${formatPrice(
    PLANS.pro.prices.USD.month,
    'USD',
  )} a month, with a ${TRIAL_DAYS}-day free trial and no card needed.`,
}

type SearchParams = Record<string, string | string[] | undefined>

export default async function PricingPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, currency: contextCurrency } = await getMarketingContext()
  const currency = resolveCurrency(searchParams.currency, contextCurrency)
  // Subscribers see their own billing period first; everyone else sees monthly.
  const subscribedInterval = viewer.signedIn ? (viewer.interval ?? undefined) : undefined
  const interval = resolveInterval(searchParams.interval ?? subscribedInterval)
  const focusPlan = resolveFocusPlan(searchParams.plan)

  return (
    <MarketingShell signedIn={viewer.signedIn} currentPlan={viewer.signedIn ? viewer.plan : undefined}>
      <section aria-labelledby="pricing-title" className="pb-20 pt-12 md:pb-28 md:pt-20">
        <Container className="flex flex-col gap-10">
          <header className="flex max-w-[44rem] flex-col gap-4">
            <h1 id="pricing-title" className="text-balance text-3xl font-semibold sm:text-4xl">
              Pay for the posts, not the setup.
            </h1>
            <p className="text-pretty text-lg text-fg-muted">
              Start on Free with one repo and a weekly digest. Every new account gets {TRIAL_DAYS} days of Pro first,
              with no card, so you can see autopilot write and post before you pay for it.
            </p>
          </header>
          <PricingTable
            initialCurrency={currency}
            initialInterval={interval}
            viewer={viewer}
            focusPlan={focusPlan}
            headingLevel="h2"
          />
        </Container>
      </section>

      <Section
        id="compare"
        layout="stacked"
        tone="sunken"
        title="Compare plans"
        lead="Every limit below is the same one the app enforces. When you reach one, nothing is deleted. CommitFlex tells you and waits."
      >
        <CompareTable />
      </Section>

      <Section id="faq" title="Billing questions">
        <FaqList items={PRICING_FAQ} />
      </Section>

      {!viewer.signedIn && <CtaBand />}
    </MarketingShell>
  )
}
