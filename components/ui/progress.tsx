import * as React from 'react'
import { cn } from '@/lib/utils'

export type ProgressTone = 'accent' | 'success' | 'warning' | 'danger'

export interface ProgressProps {
  value: number
  max?: number
  tone?: ProgressTone
  'aria-label': string
  className?: string
}

const TONE: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function Progress({ value, max = 100, tone = 'accent', className, ...props }: ProgressProps) {
  const safeMax = max > 0 ? max : 100
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), safeMax)
  const pct = (clamped / safeMax) * 100
  return (
    <div
      role="progressbar"
      aria-label={props['aria-label']}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      data-slot="progress"
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-240 ease-out', TONE[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
