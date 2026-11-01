'use client'

import * as React from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  FEATURE_LABELS,
  PLANS,
  planHasFeature,
  requiredPlanFor,
  type FeatureKey,
  type PaidPlanId,
  type PlanId,
} from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { PlanBadge } from './plan-badge'
import { useUpgrade } from './upgrade-provider'

export interface PaywallGateProps {
  plan: PlanId
  feature: FeatureKey
  children: React.ReactNode
  title?: string
  description?: string
  /** 'replace' (default) shows only the locked panel; 'overlay' shows a dimmed, inert preview under it. */
  mode?: 'replace' | 'overlay'
  className?: string
}

function requiredPaidPlan(feature: FeatureKey): PaidPlanId {
  const plan = requiredPlanFor(feature)
  return plan === 'free' ? 'pro' : plan
}

/**
 * Renders children when the plan includes the feature. Otherwise shows a
 * locked panel whose button opens the upgrade dialog. Locked features stay
 * visible: the gate explains them rather than hiding them.
 * The server still enforces every check; this is presentation only.
 */
export function PaywallGate({ plan, feature, children, title, description, mode = 'replace', className }: PaywallGateProps) {
  const { openUpgrade } = useUpgrade()
  const headingId = React.useId()
  if (planHasFeature(plan, feature)) return <>{children}</>

  const required = requiredPaidPlan(feature)
  const requiredName = PLANS[required].name
  const heading = title ?? FEATURE_LABELS[feature]
  const body = description ?? `Included with ${requiredName}. Upgrade to turn it on.`

  const panel = (
    <section
      aria-labelledby={headingId}
      data-slot="paywall-gate"
      data-feature={feature}
      className={cn(
        'flex flex-col items-start gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-5',
        mode === 'overlay' && 'w-full max-w-md shadow-md',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sunken text-fg-muted">
        <Lock className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={headingId} className="text-base font-semibold text-fg">
            {heading}
          </h3>
          <PlanBadge plan={required} />
        </div>
        <p className="text-sm text-fg-muted">{body}</p>
      </div>
      <Button
        size="sm"
        onClick={() => openUpgrade({ code: 'feature_locked', feature }, required)}
        className="shrink-0"
      >
        Upgrade to {requiredName}
      </Button>
    </section>
  )

  if (mode === 'replace') return <div className={className}>{panel}</div>

  return (
    <div className={cn('relative isolate', className)}>
      <div aria-hidden="true" ref={makeInert} className="pointer-events-none select-none opacity-40 saturate-50">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center p-4">{panel}</div>
    </div>
  )
}

/** React 18 has no `inert` prop; set the attribute so the preview can't take focus. */
function makeInert(node: HTMLDivElement | null) {
  node?.setAttribute('inert', '')
}
