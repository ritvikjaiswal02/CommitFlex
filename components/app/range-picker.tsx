'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpgrade } from '@/components/billing/upgrade-provider'

export type AnalyticsRange = '7' | '30' | '90'

const OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

/**
 * Range switcher for analytics. Ranges past 7 days need `analytics.advanced`;
 * they stay visible with a lock and open the upgrade dialog.
 */
export function RangePicker({ value, advanced }: { value: AnalyticsRange; advanced: boolean }) {
  const router = useRouter()
  const pathname = usePathname() ?? '/analytics'
  const { openUpgrade } = useUpgrade()
  const [pending, startTransition] = React.useTransition()

  const choose = (next: AnalyticsRange) => {
    if (next !== '7' && !advanced) {
      openUpgrade({ code: 'feature_locked', feature: 'analytics.advanced' }, 'pro')
      return
    }
    startTransition(() => router.push(`${pathname}?range=${next}`, { scroll: false }))
  }

  return (
    <div
      role="group"
      aria-label="Time range"
      aria-busy={pending || undefined}
      className="inline-flex items-center gap-0.5 rounded-md bg-sunken p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value
        const locked = option.value !== '7' && !advanced
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => choose(option.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium',
              'transition-[color,background-color,box-shadow] duration-120 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent',
              selected ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            {locked && <Lock className="size-3.5" strokeWidth={1.75} aria-hidden="true" />}
            {option.label}
            {locked && <span className="sr-only">(needs Pro)</span>}
          </button>
        )
      })}
    </div>
  )
}
