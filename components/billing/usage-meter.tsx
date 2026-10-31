'use client'

import * as React from 'react'
import { Progress, type ProgressTone } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useUpgrade } from './upgrade-provider'

export interface UsageMeterProps {
  label: string
  used: number
  max: number
  unit?: string
  className?: string
  /** Show an Upgrade link once usage reaches 80 %. */
  showUpgrade?: boolean
}

/** 0 to 1. A zero max counts as full once anything is used. */
export function usageRatio(used: number, max: number): number {
  if (max <= 0) return used > 0 ? 1 : 0
  return Math.min(Math.max(used / max, 0), 1)
}

export function usageTone(used: number, max: number): ProgressTone {
  if (max > 0 && used >= max) return 'danger'
  if (max > 0 && used / max >= 0.8) return 'warning'
  return 'accent'
}

/** "7 of 10 drafts" */
export function usageText(used: number, max: number, unit?: string): string {
  return `${used.toLocaleString('en-US')} of ${max.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`
}

/**
 * One limit: a label, "7 of 10 drafts" and a thin bar that turns warning at
 * 80 % and danger at 100 %. A limit of 0 reads "Not on your plan".
 */
export function UsageMeter({ label, used, max, unit, className, showUpgrade = false }: UsageMeterProps) {
  const { openUpgrade } = useUpgrade()
  const tone = usageTone(used, max)
  const notIncluded = max <= 0
  const nearLimit = !notIncluded && used / max >= 0.8
  const upgradeVisible = showUpgrade && (nearLimit || notIncluded)

  return (
    <div data-slot="usage-meter" data-tone={tone} className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-fg">{label}</span>
        <span
          className={cn(
            'shrink-0 text-sm tabular-nums',
            tone === 'danger' ? 'font-medium text-danger' : tone === 'warning' ? 'font-medium text-warning' : 'text-fg-muted',
          )}
        >
          {notIncluded ? 'Not on your plan' : usageText(used, max, unit)}
        </span>
      </div>
      {!notIncluded && (
        <Progress value={Math.min(used, max)} max={max} tone={tone} aria-label={`${label}: ${usageText(used, max, unit)}`} />
      )}
      {upgradeVisible && (
        <button
          type="button"
          onClick={() => openUpgrade({ code: 'manual' })}
          className="self-start rounded-sm text-sm font-medium text-accent underline-offset-4 transition-colors duration-120 hover:underline focus-ring"
        >
          {notIncluded ? 'See plans that include it' : used >= max ? 'Upgrade for more' : 'Upgrade before you run out'}
        </button>
      )}
    </div>
  )
}
