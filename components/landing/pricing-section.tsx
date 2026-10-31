import Link from 'next/link'
import type { Currency } from '@/lib/billing/catalog'
import { Section } from '@/components/landing/section'
import { PricingTable } from '@/components/landing/pricing/pricing-table'
import type { PricingViewer } from '@/components/landing/pricing/pricing-logic'

export function PricingSection({ currency, viewer }: { currency: Currency; viewer: PricingViewer }) {
  return (
    <Section
      id="pricing"
      layout="stacked"
      title="Start free. Pay when it's posting for you."
      lead={
        <>
          The free plan covers one repo and a weekly digest. Pro adds drafts from every merged pull request and release,
          a posting cadence and direct LinkedIn publishing.{' '}
          <Link
            href="/pricing#compare"
            className="rounded-sm text-accent underline-offset-4 hover:underline focus-ring"
          >
            Compare every feature
          </Link>
          .
        </>
      }
    >
      <PricingTable initialCurrency={currency} viewer={viewer} />
    </Section>
  )
}
