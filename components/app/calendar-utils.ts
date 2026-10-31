import { TZDate } from '@date-fns/tz'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { dayKey, parseDayKey, safeTimeZone } from '@/components/app/format'

/**
 * Calendar grid math in the user's timezone. Weeks start on Monday. Days are
 * identified by `yyyy-MM-dd` keys so they serialize cleanly into URLs.
 */

export type CalendarView = 'week' | 'month'

export interface CalendarRange {
  /** First instant of the first visible day. */
  start: Date
  /** First instant after the last visible day. */
  end: Date
  /** Visible days in order. */
  days: string[]
}

const WEEK_OPTS = { weekStartsOn: 1 as const }

export function isCalendarView(value: unknown): value is CalendarView {
  return value === 'week' || value === 'month'
}

export function keyToZoned(key: string, tz: string): TZDate {
  const parts = parseDayKey(key)
  const zone = safeTimeZone(tz)
  if (!parts) return new TZDate(Date.now(), zone)
  return new TZDate(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0, zone)
}

/** A valid anchor key: `candidate` when well-formed, otherwise today in `tz`. */
export function normalizeAnchor(candidate: string | null | undefined, tz: string, now: Date = new Date()): string {
  if (candidate && parseDayKey(candidate)) return candidate
  return dayKey(now, tz)
}

export function rangeFor(view: CalendarView, anchor: string, tz: string): CalendarRange {
  const zone = safeTimeZone(tz)
  const a = keyToZoned(anchor, zone)
  const first = view === 'week' ? startOfWeek(a, WEEK_OPTS) : startOfWeek(startOfMonth(a), WEEK_OPTS)
  const last = view === 'week' ? endOfWeek(a, WEEK_OPTS) : endOfWeek(endOfMonth(a), WEEK_OPTS)
  const days: string[] = []
  for (let d = first; d.getTime() <= last.getTime(); d = addDays(d, 1)) days.push(format(d, 'yyyy-MM-dd'))
  const startZoned = keyToZoned(days[0], zone)
  const endZoned = addDays(keyToZoned(days[days.length - 1], zone), 1)
  return { start: new Date(startZoned.getTime()), end: new Date(endZoned.getTime()), days }
}

export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1, tz: string): string {
  const a = keyToZoned(anchor, tz)
  const next = view === 'week' ? addWeeks(a, direction) : addMonths(a, direction)
  return format(next, 'yyyy-MM-dd')
}

/** "November 2026" or "2 – 8 Nov 2026" / "30 Nov – 6 Dec 2026". */
export function rangeTitle(view: CalendarView, anchor: string, tz: string): string {
  const a = keyToZoned(anchor, tz)
  if (view === 'month') return format(a, 'MMMM yyyy')
  const start = startOfWeek(a, WEEK_OPTS)
  const end = endOfWeek(a, WEEK_OPTS)
  if (start.getFullYear() !== end.getFullYear()) return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`
  if (start.getMonth() !== end.getMonth()) return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
  return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`
}

/** Whether a day key falls in the anchor's month (month view greys out the rest). */
export function inAnchorMonth(day: string, anchor: string): boolean {
  return day.slice(0, 7) === anchor.slice(0, 7)
}

export function groupByDay<T>(items: readonly T[], at: (item: T) => string | null, tz: string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const when = at(item)
    if (!when) continue
    const key = dayKey(when, tz)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

export function dayLabel(day: string, tz: string): { weekday: string; date: string; long: string } {
  const z = keyToZoned(day, tz)
  return { weekday: format(z, 'EEE'), date: format(z, 'd'), long: format(z, 'EEEE, d MMMM') }
}
