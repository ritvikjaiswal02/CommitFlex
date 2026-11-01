'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { planDisplayName, type PlanId, type PlanStatus } from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'

export interface PlanBadgeProps {
  plan: PlanId
  status?: PlanStatus
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The plan name as a small badge. Free is neutral, Pro is accent, Team is an
 * accent-ink outline. A running trial reads "Pro trial".
 */
export function PlanBadge({ plan, status, size = 'sm', className }: PlanBadgeProps) {
  const label = planDisplayName(plan, status)
  if (plan === 'team') {
    return (
      <Badge
        variant="outline"
        size={size}
        data-plan={plan}
        className={cn('border-accent-ink/40 text-accent-ink', className)}
      >
        {label}
      </Badge>
    )
  }
  return (
    <Badge variant={plan === 'pro' ? 'accent' : 'neutral'} size={size} data-plan={plan} className={className}>
      {label}
    </Badge>
  )
}
