import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  delta?: { value: string; tone: 'positive' | 'negative' | 'neutral' }
  icon?: LucideIcon
  className?: string
}

const DELTA = {
  positive: { icon: ArrowUpRight, className: 'text-success' },
  negative: { icon: ArrowDownRight, className: 'text-danger' },
  neutral: { icon: Minus, className: 'text-fg-subtle' },
} as const

export function Stat({ label, value, hint, delta, icon: Icon, className }: StatProps) {
  const deltaMeta = delta ? DELTA[delta.tone] : null
  const DeltaIcon = deltaMeta?.icon
  return (
    <dl data-slot="stat" className={cn('flex min-w-0 flex-col gap-1.5 bg-surface p-4 sm:p-5', className)}>
      <dt className="flex items-center gap-1.5 text-sm text-fg-muted">
        {Icon && <Icon className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-fg">{value}</span>
        {delta && DeltaIcon && (
          <span className={cn('inline-flex items-center gap-0.5 text-sm font-medium tabular-nums', deltaMeta.className)}>
            <DeltaIcon className="size-3.5" strokeWidth={2} aria-hidden="true" />
            {delta.value}
          </span>
        )}
      </dd>
      {hint && <dd className="text-xs text-fg-subtle">{hint}</dd>}
    </dl>
  )
}

export interface StatGroupProps {
  children: React.ReactNode
  /** Columns from `lg` up. Two columns below. */
  columns?: 2 | 3 | 4
  className?: string
}

const GROUP_COLUMNS = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
} as const

/** A row of stats divided by hairlines, not cards. */
export function StatGroup({ children, columns = 4, className }: StatGroupProps) {
  return (
    <div
      data-slot="stat-group"
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line',
        '[&>*:last-child:nth-child(odd)]:col-span-2',
        'lg:[&>*:last-child:nth-child(odd)]:col-span-1',
        GROUP_COLUMNS[columns],
        className,
      )}
    >
      {children}
    </div>
  )
}
