import { format, formatDistanceToNowStrict } from 'date-fns'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** "3 hours ago" under a week, then "Tue, 3 Nov". */
export function relativeDate(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  if (Math.abs(now.getTime() - date.getTime()) < WEEK_MS) {
    if (Math.abs(now.getTime() - date.getTime()) < 60_000) return 'just now'
    return formatDistanceToNowStrict(date, { addSuffix: true })
  }
  return format(date, 'EEE, d MMM')
}

export function absoluteDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : format(date, "d MMM yyyy 'at' HH:mm")
}
