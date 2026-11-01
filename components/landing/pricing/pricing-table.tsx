'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { CheckoutButton } from '@/components/billing/checkout-button'
import { GitHubButton } from '@/components/landing/github-button'
import {
  PLANS,
  PLAN_ORDER,
  TRIAL_DAYS,
  type BillingInterval,
  type Currency,
  type PlanId,
} from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { priceDisplay, resolvePlanCta, type PlanCta, type PricingViewer } from './pricing-logic'

const RECOMMENDED: PlanId = 'pro'

export interface PricingTableProps {
  initialCurrency: Currency
  initialInterval?: BillingInterval
  viewer: PricingViewer
  /** Scrolls to and outlines this plan, e.g. after signing in from its button. */
  focusPlan?: PlanId | null
  /** Heading level for plan names, so the table fits under any page outline. */
  headingLevel?: 'h2' | 'h3'
  className?: string
}

export function PricingTable({
  initialCurrency,
  initialInterval = 'month',
  viewer,
  focusPlan = null,
  headingLevel = 'h3',
  className,
}: PricingTableProps) {
  const [interval, setBillingInterval] = React.useState<BillingInterval>(initialInterval)
  const [currency, setCurrency] = React.useState<Currency>(initialCurrency)

  React.useEffect(() => {
    if (!focusPlan) return
    const node = document.getElementById(`plan-${focusPlan}`)
    if (!node) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  }, [focusPlan])

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<BillingInterval>
            aria-label="Billing period"
            value={interval}
            onValueChange={setBillingInterval}
            options={[
              { value: 'month', label: 'Monthly' },
              { value: 'year', label: 'Yearly' },
            ]}
          />
          <span className="text-sm text-fg-muted">Yearly is two months free.</span>
        </div>
        <SegmentedControl<Currency>
          aria-label="Currency"
          size="sm"
          value={currency}
          onValueChange={setCurrency}
          options={[
            { value: 'INR', label: '₹ INR' },
            { value: 'USD', label: '$ USD' },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((plan) => (
          <PlanColumn
            key={plan}
            plan={plan}
            interval={interval}
            currency={currency}
            viewer={viewer}
            focused={focusPlan === plan}
            HeadingTag={headingLevel}
          />
        ))}
      </div>

      <p className="text-sm text-fg-muted">
        {currency === 'INR'
          ? 'Prices in Indian rupees. Pay with UPI or a card through Razorpay.'
          : 'Prices in US dollars. Pay by card through Razorpay.'}{' '}
        Cancel any time from the billing page and keep access until the end of the period you paid for.
      </p>
    </div>
  )
}

function PlanColumn({
  plan,
  interval,
  currency,
  viewer,
  focused,
  HeadingTag,
}: {
  plan: PlanId
  interval: BillingInterval
  currency: Currency
  viewer: PricingViewer
  focused: boolean
  HeadingTag: 'h2' | 'h3'
}) {
  const definition = PLANS[plan]
  const price = priceDisplay(plan, interval, currency)
  const cta = resolvePlanCta(plan, viewer, interval)
  const recommended = plan === RECOMMENDED
  const isCurrent = viewer.signedIn && viewer.plan === plan && viewer.status !== 'trialing'
  const isTrial = viewer.signedIn && viewer.plan === plan && viewer.status === 'trialing'
  const headingId = `plan-${plan}-name`

  return (
    <section
      id={`plan-${plan}`}
      aria-labelledby={headingId}
      className={cn(
        'flex scroll-mt-20 flex-col rounded-lg border bg-surface p-5 sm:p-6',
        recommended ? 'border-accent ring-1 ring-accent' : 'border-line',
        focused && !recommended && 'border-line-strong ring-1 ring-line-strong',
      )}
    >
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <HeadingTag id={headingId} className="text-lg font-semibold text-fg">
          {definition.name}
        </HeadingTag>
        {recommended && !isCurrent && !isTrial && <Badge variant="accent">Recommended</Badge>}
        {isCurrent && <Badge variant="success">Current plan</Badge>}
        {isTrial && <Badge variant="accent">On trial</Badge>}
      </div>
      <p className="mt-1 text-sm text-fg-muted">{definition.tagline}</p>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-semibold tabular-nums text-fg">{price.amount}</span>
        <span className="text-sm text-fg-muted">{price.period}</span>
      </p>
      <p className="mt-1 min-h-10 text-sm text-fg-subtle">
        {plan === 'free'
          ? `Every account starts with ${TRIAL_DAYS} days of Pro, then moves to Free unless you upgrade.`
          : plan === 'pro' && !viewer.signedIn
            ? `${TRIAL_DAYS} days free, no card needed.`
            : (price.note ?? (interval === 'month' ? 'Billed monthly.' : 'Billed once a year.'))}
      </p>

      <div className="mt-6">
        <PlanAction cta={cta} interval={interval} currency={currency} primary={recommended} />
      </div>

      <ul className="mt-6 flex flex-col gap-2.5 border-t border-line pt-6">
        {definition.highlights.map((line) => (
          <li key={line} className="flex gap-2.5 text-sm text-fg">
            <Check className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PlanAction({
  cta,
  interval,
  currency,
  primary,
}: {
  cta: PlanCta
  interval: BillingInterval
  currency: Currency
  primary: boolean
}) {
  const variant = primary ? 'primary' : 'secondary'
  switch (cta.kind) {
    case 'signin':
      return (
        <GitHubButton next={cta.next} variant={variant} size="lg" fullWidth>
          {cta.label}
        </GitHubButton>
      )
    case 'checkout':
      return (
        <CheckoutButton
          plan={cta.plan}
          interval={interval}
          currency={currency}
          variant={variant}
          size="lg"
          fullWidth
          source="pricing"
        >
          {cta.label}
        </CheckoutButton>
      )
    case 'link':
      return (
        <ButtonLink href={cta.href} variant="secondary" size="lg" className="w-full">
          {cta.label}
        </ButtonLink>
      )
    case 'current':
      return (
        <Button variant="secondary" size="lg" disabled className="w-full">
          {cta.label}
        </Button>
      )
  }
}
