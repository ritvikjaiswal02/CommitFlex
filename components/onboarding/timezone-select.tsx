'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldControlClass } from '@/components/ui/input'
import { listTimeZones, timeZoneAbbreviation } from './questions'

export interface TimezoneSelectProps {
  value: string
  onChange: (tz: string) => void
  id?: string
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

function offsetLabel(tz: string): string {
  const abbr = timeZoneAbbreviation(tz)
  return abbr && abbr !== tz ? ` (${abbr})` : ''
}

/**
 * Time zone picker. A native select on purpose: 400+ zones, and the browser's
 * type-to-find and mobile wheel are better than anything custom here.
 */
export function TimezoneSelect({ value, onChange, id, className, ...aria }: TimezoneSelectProps) {
  const zones = React.useMemo(() => {
    const list = listTimeZones()
    const all = list.includes(value) ? list : [value, ...list]
    return all.map((tz) => ({ tz, label: `${tz.replace(/_/g, ' ')}${offsetLabel(tz)}` }))
  }, [value])

  return (
    <div className={cn('relative', className)}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        className={cn(fieldControlClass, 'h-9 w-full cursor-pointer appearance-none pl-3 pr-9 text-base sm:text-sm')}
      >
        {zones.map(({ tz, label }) => (
          <option key={tz} value={tz}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </div>
  )
}
