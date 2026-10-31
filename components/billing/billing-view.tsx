'use client'

import * as React from 'react'
import { Check, LifeBuoy, Lock } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { PageHeader } from '@/components/ui/page-header'
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  LIMIT_LABELS,
  PLANS,
  formatPrice,
  nextPlan,
  planHasFeature,
  requiredPlanFor,
  type BillingInterval,
  type LimitKey,
  type PaidPlanId,
} from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { CancelSubscriptionDialog } from './cancel-subscription-dialog'
import { CheckoutButton } from './checkout-button'
import { daysUntil, formatBillingDate, relativeDays, usageResetDate } from './format'
import { InvoiceList } from './invoice-list'
import { PlanBadge } from './plan-badge'
import { PlanSwitcher } from './plan-switcher'
import type { BillingPlanView, BillingStatusResponse } from './types'
import { useUpgrade } from './upgrade-provider'
import { UsageMeter } from './usage-meter'

export interface BillingViewProps {
  status: BillingStatusResponse
  /** True when any subscription got past checkout, so invoices may exist. */
  hasPaidHistory: boolean
  /** Shown to Team customers for priority support, when configured. */
  supportEmail: string | null
  highlight?: PaidPlanId | null
  defaultInterval?: BillingInterval
}

/** Limits in the order people care about them. */
const USAGE_ORDER: LimitKey[] = ['generationsPerMonth', 'queuedPosts', 'repos', 'voiceProfiles', 'extensionTokens', 'reviewers']

export function BillingView({ status, hasPaidHistory, supportEmail, highlight, defaultInterval }: BillingViewProps) {
  const { plan, usage, configured, checkout, suggestedCurrency } = status
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const paying = plan.status === 'active' || plan.status === 'past_due' || plan.status === 'cancelling'
  const prioritySupport = planHasFeature(plan.id, 'support.priority')

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Billing"
        description="Your plan, what you've used this month, and your invoices."
        actions={
          <ButtonLink href="/pricing" variant="secondary">
            Compare plans
          </ButtonLink>
        }
        className="mb-0 lg:mb-0"
      />

      <StatusNotice plan={plan} configured={configured} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <CurrentPlanPanel plan={plan} paying={paying} onCancel={() => setCancelOpen(true)} />
        <UsagePanel planId={plan.id} usage={usage} />
      </div>

      <section aria-labelledby="change-plan-heading" className="flex flex-col gap-4">
        <SectionHeading
          id="change-plan-heading"
          title={paying ? 'Change plan' : 'Choose a plan'}
          description={`${
            (plan.currency ?? suggestedCurrency) === 'INR'
              ? 'Pay with UPI or a card through Razorpay.'
              : 'Pay by card through Razorpay.'
          } A yearly plan costs the same as ten months.`}
        />
        <PlanSwitcher
          current={plan}
          checkout={checkout}
          configured={configured}
          defaultCurrency={plan.currency ?? suggestedCurrency}
          defaultInterval={defaultInterval}
          highlight={highlight}
          onCancel={() => setCancelOpen(true)}
        />
      </section>

      <section aria-labelledby="invoices-heading" className="flex flex-col gap-4">
        <SectionHeading id="invoices-heading" title="Invoices" description="Every charge from Razorpay, newest first." />
        <InvoiceList hasPaidHistory={hasPaidHistory} />
      </section>

      {prioritySupport && (
        <section
          aria-label="Priority support"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sunken text-fg-muted">
            <LifeBuoy className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-base font-semibold text-fg">Priority support</p>
            <p className="text-sm text-fg-muted">
              Your Team plan includes priority support. Questions about billing, publishing or reviewers go to the front
              of the queue.
            </p>
          </div>
          {supportEmail && (
            <ButtonLink href={`mailto:${supportEmail}`} variant="secondary" size="sm" className="shrink-0">
              Email support
            </ButtonLink>
          )}
        </section>
      )}

      <CancelSubscriptionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        planName={PLANS[plan.id].name}
        periodEnd={plan.currentPeriodEnd}
      />
    </div>
  )
}

function SectionHeading({ id, title, description }: { id: string; title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="text-xl font-semibold text-fg">
        {title}
      </h2>
      {description && <p className="text-sm text-fg-muted">{description}</p>}
    </div>
  )
}

function StatusNotice({ plan, configured }: { plan: BillingPlanView; configured: boolean }) {
  const name = PLANS[plan.id].name
  const end = formatBillingDate(plan.currentPeriodEnd)

  if (plan.status === 'past_due') {
    return (
      <Callout tone="danger" title="Your last payment didn't go through">
        Razorpay retries the charge automatically over the next few days. If it keeps failing, your account moves to Free
        until you subscribe again. Nothing is deleted.
      </Callout>
    )
  }

  if (plan.status === 'cancelling') {
    return (
      <Callout
        tone="warning"
        title={end ? `${name} ends on ${end}` : `${name} is cancelled`}
        action={
          plan.id !== 'free' && plan.interval ? (
            <CheckoutButton plan={plan.id} interval={plan.interval} currency={plan.currency ?? undefined} size="md" variant="secondary" source="billing:resubscribe">
              Keep {name}
            </CheckoutButton>
          ) : undefined
        }
      >
        After that your account moves to Free. Ship moments and cadence stop and the weekly digest keeps running. Your
        drafts, queue and repos stay as they are.
      </Callout>
    )
  }

  if (plan.status === 'trialing') {
    const days = daysUntil(plan.trialEndsAt)
    const trialEnd = formatBillingDate(plan.trialEndsAt)
    return (
      <Callout tone="info" title={days !== null ? `Your Pro trial ends ${relativeDays(days)}` : 'You are on the Pro trial'}>
        {trialEnd ? `Pick a plan before ${trialEnd} to keep ` : 'Pick a plan to keep '}
        ship moments, cadence and direct LinkedIn publishing. Otherwise your account moves to Free and nothing is deleted.
      </Callout>
    )
  }

  if (plan.status === 'free' && plan.trialEndsAt && (daysUntil(plan.trialEndsAt) ?? 1) === 0) {
    const trialEnd = formatBillingDate(plan.trialEndsAt)
    return (
      <Callout tone="info" title={trialEnd ? `Your Pro trial ended on ${trialEnd}` : 'Your Pro trial has ended'}>
        You’re on Free: one repo, ten drafts a month and the weekly digest. Upgrade to bring back ship moments, cadence
        and direct LinkedIn publishing.
      </Callout>
    )
  }

  if (!configured) {
    return (
      <Callout tone="info" title="Payments aren't set up on this deployment">
        Add the Razorpay keys and plan IDs to the environment to turn on checkout. Plans and usage below still reflect
        your account.
      </Callout>
    )
  }

  return null
}

function CurrentPlanPanel({ plan, paying, onCancel }: { plan: BillingPlanView; paying: boolean; onCancel: () => void }) {
  const { openUpgrade } = useUpgrade()
  const definition = PLANS[plan.id]
  const end = formatBillingDate(plan.currentPeriodEnd)
  const upgradeTarget: PaidPlanId = plan.status === 'trialing' ? 'pro' : nextPlan(plan.id)
  const canUpgrade = plan.id !== 'team' || plan.status === 'trialing'

  let priceLine: string
  if (paying && plan.interval && plan.currency && plan.id !== 'free') {
    const amount = definition.prices[plan.currency][plan.interval]
    priceLine = `${formatPrice(amount, plan.currency)} ${plan.interval === 'month' ? 'a month' : 'a year'}`
  } else if (plan.status === 'trialing') {
    priceLine = 'Free while your trial runs'
  } else {
    priceLine = 'Free, no card on file'
  }

  let renewalLine: string | null = null
  if (plan.status === 'active') renewalLine = end ? `Renews on ${end}` : 'Renews automatically'
  else if (plan.status === 'cancelling') renewalLine = end ? `Ends on ${end}, no further charges` : 'No further charges'
  else if (plan.status === 'past_due') renewalLine = 'Payment overdue. Razorpay is retrying.'
  else if (plan.status === 'trialing') renewalLine = end ? `Trial ends on ${end}` : null

  return (
    <section aria-labelledby="current-plan-heading" className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-sm text-fg-muted">Current plan</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="current-plan-heading" className="text-2xl font-semibold text-fg">
              {definition.name}
            </h2>
            <PlanBadge plan={plan.id} status={plan.status} size="md" />
          </div>
          <p className="text-base text-fg">{priceLine}</p>
          {renewalLine && (
            <p className={cn('text-sm', plan.status === 'past_due' ? 'text-danger' : 'text-fg-muted')}>{renewalLine}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canUpgrade && (
            <Button onClick={() => openUpgrade({ code: 'manual' }, upgradeTarget)}>
              Upgrade to {PLANS[upgradeTarget].name}
            </Button>
          )}
          {paying && plan.status !== 'cancelling' && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel subscription
            </Button>
          )}
        </div>
      </div>

      <div className="border-t border-line p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-medium text-fg">What your plan includes</h3>
        <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {FEATURE_KEYS.map((key) => {
            const included = planHasFeature(plan.id, key)
            const required = requiredPlanFor(key)
            return (
              <li key={key} className="flex items-start gap-2 text-sm" data-included={included || undefined}>
                {included ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Lock className="mt-0.5 size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span className={cn('min-w-0 flex-1', included ? 'text-fg' : 'text-fg-subtle')}>
                  {FEATURE_LABELS[key]}
                  <span className="sr-only">{included ? ' (included)' : ' (not included)'}</span>
                </span>
                {!included && required !== 'free' && <PlanBadge plan={required} className="mt-px" />}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function UsagePanel({ planId, usage }: { planId: BillingPlanView['id']; usage: BillingStatusResponse['usage'] }) {
  const reset = usageResetDate(usage.period)
  const showUpgrade = planId !== 'team'
  return (
    <section aria-labelledby="usage-heading" className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="usage-heading" className="text-xl font-semibold text-fg">
          Usage
        </h2>
        <p className="text-sm text-fg-muted">
          {reset ? `Drafts reset on ${reset} (UTC). ` : ''}Other limits count what you have right now.
        </p>
      </div>
      <div className="flex flex-col gap-5">
        {USAGE_ORDER.map((key) => {
          const item = usage.items[key]
          if (!item) return null
          return (
            <UsageMeter
              key={key}
              label={LIMIT_LABELS[key].label}
              used={item.used}
              max={item.max}
              unit={LIMIT_LABELS[key].unit}
              showUpgrade={showUpgrade}
            />
          )
        })}
      </div>
    </section>
  )
}
