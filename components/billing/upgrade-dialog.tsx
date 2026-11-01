'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LIMIT_LABELS,
  PLANS,
  featureLockedMessage,
  formatPrice,
  limitReachedMessage,
  nextPlan,
  planRank,
  requiredPlanFor,
  yearlySavings,
  type BillingInterval,
  type Currency,
  type FeatureKey,
  type LimitKey,
  type PaidPlanId,
  type PlanId,
} from '@/lib/billing/catalog'
import { CheckoutButton } from './checkout-button'
import { guessCurrency, useBillingStatus } from './use-billing-status'

export interface UpgradeReason {
  code: 'feature_locked' | 'limit_reached' | 'manual'
  feature?: FeatureKey
  limit?: LimitKey
  used?: number
  max?: number
}

export interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason?: UpgradeReason
  requiredPlan?: PaidPlanId
  currentPlan?: PlanId
  /** Where the dialog was opened from; stored on the Razorpay subscription. */
  source?: string
}

const INTERVAL_OPTIONS: { value: BillingInterval; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
]

/** The plan to offer: the one the server asked for, else the next one up. */
export function targetPlanFor(reason: UpgradeReason | undefined, requiredPlan?: PaidPlanId, currentPlan?: PlanId): PaidPlanId {
  if (requiredPlan) return requiredPlan
  if (reason?.code === 'feature_locked' && reason.feature) {
    const plan = requiredPlanFor(reason.feature)
    if (plan !== 'free') return plan
  }
  return nextPlan(currentPlan ?? 'free')
}

/** One sentence that says what is locked and what the plan changes. */
export function upgradeMessage(reason: UpgradeReason | undefined, target: PaidPlanId): string {
  if (reason?.code === 'limit_reached' && reason.limit && typeof reason.used === 'number' && typeof reason.max === 'number') {
    return limitReachedMessage(reason.limit, reason.used, reason.max, target)
  }
  if (reason?.code === 'limit_reached' && reason.limit) {
    const { label } = LIMIT_LABELS[reason.limit]
    return `You've reached your plan's limit for ${label.toLowerCase()}. ${PLANS[target].name} includes ${PLANS[target].limits[reason.limit]}.`
  }
  if (reason?.code === 'feature_locked' && reason.feature) {
    return featureLockedMessage(reason.feature, target)
  }
  return PLANS[target].tagline
}

/**
 * Explains what's locked and offers the plan that unlocks it, with a
 * monthly/yearly toggle and a Razorpay checkout button.
 */
export function UpgradeDialog({ open, onOpenChange, reason, requiredPlan, currentPlan, source }: UpgradeDialogProps) {
  const { status, loading } = useBillingStatus(open)
  const effectiveCurrent: PlanId = status?.plan.id ?? currentPlan ?? 'free'
  const target = targetPlanFor(reason, requiredPlan, effectiveCurrent)
  const definition = PLANS[target]
  const alreadyThere = planRank(effectiveCurrent) >= planRank(target) && status?.plan.status !== 'trialing'

  const [interval, setBillingInterval] = React.useState<BillingInterval>('month')
  const [currency, setCurrency] = React.useState<Currency>(() => guessCurrency())
  const [touchedCurrency, setTouchedCurrency] = React.useState(false)

  // Adopt the server's suggestion (country or existing billing currency) until the user picks one.
  React.useEffect(() => {
    if (status && !touchedCurrency) setCurrency(status.suggestedCurrency)
  }, [status, touchedCurrency])

  const available = status?.checkout?.[target]?.[interval]
  const currencyChoices = CURRENCY_OPTIONS.map((o) => ({
    ...o,
    disabled: available ? !available.includes(o.value) : false,
  }))
  // If the chosen currency can't be charged for this plan and interval, fall back to one that can.
  React.useEffect(() => {
    if (available && available.length > 0 && !available.includes(currency)) setCurrency(available[0])
  }, [available, currency])

  const configured = status ? status.configured : true
  const purchasable = configured && (!available || available.includes(currency))
  const monthly = definition.prices[currency].month
  const yearly = definition.prices[currency].year
  const savings = yearlySavings(target, currency)
  const message = upgradeMessage(reason, target)
  const trialing = status?.plan.status === 'trialing'

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent size="md" data-testid="upgrade-dialog">
        <DialogHeader>
          <DialogTitle>{alreadyThere ? `You're on ${PLANS[effectiveCurrent].name}` : `Upgrade to ${definition.name}`}</DialogTitle>
          <DialogDescription className="text-base">
            {alreadyThere ? 'Your plan already includes this. Refresh the page if it still looks locked.' : message}
          </DialogDescription>
        </DialogHeader>

        {!alreadyThere && (
          <DialogBody className="flex flex-col gap-5 pt-0 sm:pt-0">
            <section
              aria-label={`${definition.name} plan`}
              className="flex flex-col gap-4 rounded-lg border border-line bg-sunken/40 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-lg font-semibold text-fg">{definition.name}</span>
                  <p className="text-sm text-fg-muted">{definition.tagline}</p>
                </div>
                <SegmentedControl
                  aria-label="Billing interval"
                  size="sm"
                  value={interval}
                  onValueChange={setBillingInterval}
                  options={INTERVAL_OPTIONS}
                />
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5" aria-live="polite">
                  {loading && !status ? (
                    <Skeleton className="h-9 w-28" />
                  ) : (
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-semibold tabular-nums text-fg">
                        {formatPrice(interval === 'month' ? monthly : yearly, currency)}
                      </span>
                      <span className="text-sm text-fg-muted">{interval === 'month' ? 'a month' : 'a year'}</span>
                    </p>
                  )}
                  <p className="text-xs text-fg-subtle">
                    {interval === 'year'
                      ? `Two months free: you save ${formatPrice(savings, currency)} a year.`
                      : `Or ${formatPrice(yearly, currency)} a year, two months free.`}
                  </p>
                </div>
                <SegmentedControl
                  aria-label="Currency"
                  size="sm"
                  value={currency}
                  onValueChange={(value) => {
                    setTouchedCurrency(true)
                    setCurrency(value)
                  }}
                  options={currencyChoices}
                />
              </div>

              <ul className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
                {definition.highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-fg">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {trialing && (
              <p className="text-sm text-fg-muted">
                You’re on the Pro trial. Paying now starts your subscription today, and the remaining trial days aren’t added on.
              </p>
            )}

            {!configured && (
              <Callout tone="info" title="Payments aren't set up yet">
                Checkout is not configured on this deployment, so upgrades are unavailable for now.
              </Callout>
            )}
          </DialogBody>
        )}

        <DialogFooter className="sm:justify-between">
          <Link
            href="/pricing"
            className="self-center rounded-sm text-sm font-medium text-fg-muted underline-offset-4 transition-colors duration-120 hover:text-fg hover:underline focus-ring-surface"
          >
            Compare all plans
          </Link>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <DialogClose render={<Button variant="secondary" />}>{alreadyThere ? 'Close' : 'Not now'}</DialogClose>
            {!alreadyThere && (
              <CheckoutButton
                plan={target}
                interval={interval}
                currency={currency}
                disabled={!purchasable}
                source={source ?? reasonSource(reason)}
                onCheckoutOpen={() => onOpenChange(false)}
                onSuccess={() => onOpenChange(false)}
              >
                Upgrade to {definition.name}
              </CheckoutButton>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function reasonSource(reason: UpgradeReason | undefined): string {
  if (reason?.code === 'feature_locked' && reason.feature) return `upgrade-dialog:${reason.feature}`
  if (reason?.code === 'limit_reached' && reason.limit) return `upgrade-dialog:${reason.limit}`
  return 'upgrade-dialog'
}
