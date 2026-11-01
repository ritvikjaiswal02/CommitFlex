'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  PLANS,
  PLAN_ORDER,
  formatPrice,
  planRank,
  yearlySavings,
  type BillingInterval,
  type Currency,
  type PaidPlanId,
  type PlanId,
} from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { CheckoutButton } from './checkout-button'
import { formatShortDate } from './format'
import type { BillingPlanView, CheckoutAvailability } from './types'

export interface PlanSwitcherProps {
  current: BillingPlanView
  checkout: CheckoutAvailability
  configured: boolean
  defaultCurrency: Currency
  defaultInterval?: BillingInterval
  /** Plan to highlight, e.g. from /billing?plan=team. */
  highlight?: PaidPlanId | null
  onCancel: () => void
}

const INTERVALS: { value: BillingInterval; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

/**
 * Free, Pro and Team as rows in one bordered list, with the interval and
 * currency switches above. The current plan is marked; every other row has
 * the one action that moves you there.
 */
export function PlanSwitcher({
  current,
  checkout,
  configured,
  defaultCurrency,
  defaultInterval,
  highlight,
  onCancel,
}: PlanSwitcherProps) {
  const [interval, setBillingInterval] = React.useState<BillingInterval>(defaultInterval ?? current.interval ?? 'month')
  const [currency, setCurrency] = React.useState<Currency>(defaultCurrency)
  const highlightRef = React.useRef<HTMLLIElement | null>(null)

  React.useEffect(() => {
    if (highlight) highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlight])

  const paying = current.status === 'active' || current.status === 'past_due' || current.status === 'cancelling'
  const canCharge = (plan: PaidPlanId) => configured && checkout[plan][interval].includes(currency)
  const currencyMissing =
    configured && (['pro', 'team'] as const).every((p) => !checkout[p][interval].includes(currency))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl aria-label="Billing interval" value={interval} onValueChange={setBillingInterval} options={INTERVALS} />
        <div className="flex items-center gap-3">
          {interval === 'year' && <span className="text-sm text-fg-muted">Two months free on yearly plans</span>}
          <SegmentedControl
            aria-label="Currency"
            size="sm"
            value={currency}
            onValueChange={setCurrency}
            options={[
              { value: 'INR', label: 'INR' },
              { value: 'USD', label: 'USD' },
            ]}
          />
        </div>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId]
          const isCurrent = planId === current.id && current.status !== 'trialing'
          const isTrialPlan = planId === current.id && current.status === 'trialing'
          const highlighted = highlight === planId
          const price = plan.prices[currency][interval]
          return (
            <li
              key={planId}
              ref={highlighted ? highlightRef : undefined}
              data-plan={planId}
              data-current={isCurrent || undefined}
              className={cn(
                'flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:gap-6',
                highlighted && 'bg-accent-soft/40',
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-fg">{plan.name}</span>
                  {isCurrent && <Badge variant="accent">Current plan</Badge>}
                  {isTrialPlan && <Badge variant="neutral">On trial</Badge>}
                </div>
                <p className="text-sm text-fg-muted">{plan.tagline}</p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {plan.highlights.slice(0, 3).map((item) => (
                    <li key={item} className="flex items-center gap-1.5 text-sm text-fg-muted">
                      <Check className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={2} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex shrink-0 flex-col gap-0.5 md:w-36 md:text-right">
                <p className="flex items-baseline gap-1 md:justify-end">
                  <span className="text-xl font-semibold tabular-nums text-fg">{formatPrice(price, currency)}</span>
                  <span className="text-sm text-fg-muted">{planId === 'free' ? 'forever' : interval === 'month' ? '/ month' : '/ year'}</span>
                </p>
                {planId !== 'free' && interval === 'year' && (
                  <p className="text-xs text-fg-subtle">Save {formatPrice(yearlySavings(planId, currency), currency)}</p>
                )}
              </div>

              <div className="flex shrink-0 md:w-44 md:justify-end">
                <PlanAction
                  planId={planId}
                  current={current}
                  interval={interval}
                  currency={currency}
                  paying={paying}
                  canCharge={planId === 'free' ? true : canCharge(planId)}
                  onCancel={onCancel}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {currencyMissing && (
        <p className="text-sm text-warning">
          {currency} billing isn’t available for {interval === 'month' ? 'monthly' : 'yearly'} plans yet. Switch currency or interval.
        </p>
      )}
      {paying && (
        <p className="text-xs text-fg-subtle">
          Switching plans takes effect right away. Your new subscription starts today and the current one ends when it does.
        </p>
      )}
    </div>
  )
}

function PlanAction({
  planId,
  current,
  interval,
  currency,
  paying,
  canCharge,
  onCancel,
}: {
  planId: PlanId
  current: BillingPlanView
  interval: BillingInterval
  currency: Currency
  paying: boolean
  canCharge: boolean
  onCancel: () => void
}) {
  const trialing = current.status === 'trialing'

  if (planId === 'free') {
    if (current.id === 'free') return <span className="text-sm text-fg-muted">Your plan</span>
    if (trialing) return <span className="text-sm text-fg-muted">After your trial</span>
    if (current.status === 'cancelling') return <span className="text-sm text-fg-muted">From {endHint(current)}</span>
    return (
      <Button variant="ghost" size="sm" onClick={onCancel} className="w-full md:w-auto">
        Cancel subscription
      </Button>
    )
  }

  const sameInterval = current.interval === interval
  const isCurrentPaid = paying && current.id === planId
  if (isCurrentPaid && sameInterval && current.status !== 'cancelling') {
    return <span className="text-sm text-fg-muted">Your plan</span>
  }

  let label: string
  if (isCurrentPaid && current.status === 'cancelling') label = `Keep ${PLANS[planId].name}`
  else if (isCurrentPaid) label = interval === 'year' ? 'Switch to yearly' : 'Switch to monthly'
  else if (paying && planRank(planId) < planRank(current.id)) label = `Switch to ${PLANS[planId].name}`
  else label = `Upgrade to ${PLANS[planId].name}`

  const primary = !paying || planRank(planId) > planRank(current.id)

  return (
    <CheckoutButton
      plan={planId}
      interval={interval}
      currency={currency}
      variant={primary ? 'primary' : 'secondary'}
      size="md"
      disabled={!canCharge}
      source="billing"
      className="w-full md:w-auto"
    >
      {label}
    </CheckoutButton>
  )
}

function endHint(current: BillingPlanView): string {
  return formatShortDate(current.currentPeriodEnd) ?? 'the period end'
}
