'use client'

import * as React from 'react'
import { formatDayTime, safeTimeZone, timeZoneAbbr } from '@/components/app/format'

/**
 * Formats an instant in the viewer's own timezone. Used on public pages
 * (approval links) where we don't know the profile timezone. Renders the UTC
 * form on the server and swaps to local time after hydration.
 */
export function LocalTime({ iso, fallbackTimeZone = 'UTC' }: { iso: string; fallbackTimeZone?: string }) {
  const [tz, setTz] = React.useState(safeTimeZone(fallbackTimeZone))

  React.useEffect(() => {
    try {
      setTz(safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone))
    } catch {
      // keep the fallback
    }
  }, [])

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {formatDayTime(date, tz)} {timeZoneAbbr(tz, date)}
    </time>
  )
}
