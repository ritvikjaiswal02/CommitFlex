import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays, format } from 'date-fns'

/**
 * Date formatting for the app, always in the user's profile timezone.
 *
 * Copy rules (BUILD_CONTRACTS §7.8): relative time under 7 days ("in 3 hours",
 * "yesterday at 18:00"), then `EEE, d MMM`. Pure and client-safe.
 */

export type DateInput = Date | string | number

export const DEFAULT_TIMEZONE = 'UTC'

/** Returns `tz` when the runtime knows it, otherwise UTC. */
export function safeTimeZone(tz?: string | null): string {
  if (!tz) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input)
}

export function toZoned(input: DateInput, tz: string): TZDate {
  return new TZDate(toDate(input).getTime(), safeTimeZone(tz))
}

/** `18:00` */
export function formatTime(input: DateInput, tz: string): string {
  return format(toZoned(input, tz), 'HH:mm')
}

/** `Tue, 3 Nov` (adds the year when it isn't the current one). */
export function formatDay(input: DateInput, tz: string, now: DateInput = new Date()): string {
  const date = toZoned(input, tz)
  const sameYear = date.getFullYear() === toZoned(now, tz).getFullYear()
  return format(date, sameYear ? 'EEE, d MMM' : 'EEE, d MMM yyyy')
}

/** `Tue, 3 Nov at 09:30` */
export function formatDayTime(input: DateInput, tz: string, now: DateInput = new Date()): string {
  return `${formatDay(input, tz, now)} at ${formatTime(input, tz)}`
}

/** `Tue, 9:30`, the form used in "Scheduled for Tue, 9:30" toasts. */
export function formatSlot(input: DateInput, tz: string): string {
  return format(toZoned(input, tz), 'EEE, H:mm')
}

/** `yyyy-MM-dd` for the calendar day `input` falls on in `tz`. */
export function dayKey(input: DateInput, tz: string): string {
  return format(toZoned(input, tz), 'yyyy-MM-dd')
}

/** Parses `yyyy-MM-dd` into its parts, or null when malformed. */
export function parseDayKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** Parses `HH:mm`, or null when malformed. */
export function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return { hours, minutes }
}

/** The instant a wall-clock date and time in `tz` refers to. */
export function zonedDateTimeToUtc(day: string, time: string, tz: string): Date | null {
  const d = parseDayKey(day)
  const t = parseTime(time)
  if (!d || !t) return null
  const zoned = new TZDate(d.year, d.month - 1, d.day, t.hours, t.minutes, 0, 0, safeTimeZone(tz))
  const ms = zoned.getTime()
  return Number.isNaN(ms) ? null : new Date(ms)
}

/** Short timezone name such as `IST`, `PST` or `GMT+5:30`. */
export function timeZoneAbbr(tz: string, at: DateInput = new Date()): string {
  const zone = safeTimeZone(tz)
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(toDate(at))
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
  } catch {
    return zone
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * Relative description of `input` from `now`, in `tz`:
 * "just now", "in 12 min", "3 hours ago", "today at 18:00", "tomorrow at 09:00",
 * "yesterday at 18:00", "Fri at 09:00", then "Tue, 3 Nov".
 */
export function formatWhen(input: DateInput, tz: string, now: DateInput = new Date()): string {
  const date = toDate(input)
  const ref = toDate(now)
  if (Number.isNaN(date.getTime())) return ''
  const diff = date.getTime() - ref.getTime()
  const abs = Math.abs(diff)
  const future = diff > 0

  if (abs < 45_000) return 'just now'
  if (abs < HOUR) {
    const minutes = Math.max(1, Math.round(abs / MINUTE))
    return future ? `in ${minutes} min` : `${minutes} min ago`
  }

  const zone = safeTimeZone(tz)
  const days = differenceInCalendarDays(toZoned(date, zone), toZoned(ref, zone))
  const time = formatTime(date, zone)

  if (days === 0) {
    if (abs < 3 * HOUR) {
      const hours = Math.round(abs / HOUR)
      const unit = hours === 1 ? 'hour' : 'hours'
      return future ? `in ${hours} ${unit}` : `${hours} ${unit} ago`
    }
    return `today at ${time}`
  }
  if (days === 1) return `tomorrow at ${time}`
  if (days === -1) return `yesterday at ${time}`
  if (Math.abs(days) < 7) return `${format(toZoned(date, zone), 'EEE')} at ${time}`
  return formatDay(date, zone, ref)
}

/** Upper-cases the first letter, for relative labels that start a sentence. */
export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
