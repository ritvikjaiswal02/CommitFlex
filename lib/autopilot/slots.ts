/**
 * Posting slots. Pure: every function takes the clock as an argument.
 *
 * A slot is `postTime` on one of `postDays` (0 = Sunday) in the profile
 * timezone. With the `ship_moments` cadence every day is a slot day, because
 * ship moments can happen any day. A slot holds at most one item per platform.
 */
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import type { AutopilotCadence } from '@/types/autopilot'

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

export const DEFAULT_POST_DAYS: Record<AutopilotCadence, number[]> = {
  ship_moments: [0, 1, 2, 3, 4, 5, 6],
  weekly: [2],
  twice_weekly: [2, 4],
  three_weekly: [1, 3, 5],
  weekdays: [1, 2, 3, 4, 5],
}

/** How many posts per week each cadence aims for (per platform). */
export const CADENCE_POSTS_PER_WEEK: Record<AutopilotCadence, number | null> = {
  ship_moments: null,
  weekly: 1,
  twice_weekly: 2,
  three_weekly: 3,
  weekdays: 5,
}

export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function normalizeTimezone(tz: string | null | undefined): string {
  return isValidTimezone(tz) ? tz : 'UTC'
}

export function parsePostTime(value: string | null | undefined): { hours: number; minutes: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  if (!m) return { hours: 9, minutes: 0 }
  const hours = Math.min(23, Math.max(0, Number(m[1])))
  const minutes = Math.min(59, Math.max(0, Number(m[2])))
  return { hours, minutes }
}

/**
 * The post days a cadence actually uses. `ship_moments` always uses every
 * day. Other cadences use the stored days when they have the right count,
 * otherwise the cadence default.
 */
export function effectivePostDays(cadence: AutopilotCadence, postDays: number[] | null | undefined): number[] {
  if (cadence === 'ship_moments') return [...ALL_DAYS]
  const cleaned = Array.from(new Set((postDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort(
    (a, b) => a - b,
  )
  const expected = CADENCE_POSTS_PER_WEEK[cadence]
  if (cleaned.length === 0 || (expected !== null && cleaned.length !== expected)) return [...DEFAULT_POST_DAYS[cadence]]
  return cleaned
}

/** Calendar fields of `date` as seen in `timezone`. */
export function localParts(date: Date, timezone: string) {
  const d = new TZDate(date.getTime(), normalizeTimezone(timezone))
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    weekday: d.getDay(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  }
}

export interface SlotSettings {
  cadence: AutopilotCadence
  postDays: number[]
  postTime: string
  timezone: string
}

/**
 * Slots strictly after `from`, in order. Stops after `count` slots or once a
 * slot passes `until` (whichever comes first). Looks at most `maxDays` ahead.
 */
export function upcomingSlots(
  settings: SlotSettings,
  from: Date,
  opts: { count?: number; until?: Date; maxDays?: number } = {},
): Date[] {
  const tz = normalizeTimezone(settings.timezone)
  const days = new Set(effectivePostDays(settings.cadence, settings.postDays))
  const { hours, minutes } = parsePostTime(settings.postTime)
  const count = opts.count ?? 10
  const maxDays = opts.maxDays ?? 120
  const start = localParts(from, tz)
  const out: Date[] = []

  for (let i = 0; i <= maxDays && out.length < count; i++) {
    const candidate = new TZDate(start.year, start.month, start.day + i, hours, minutes, tz)
    if (opts.until && candidate.getTime() > opts.until.getTime()) break
    if (!days.has(candidate.getDay())) continue
    if (candidate.getTime() <= from.getTime()) continue
    out.push(new Date(candidate.getTime()))
  }
  return out
}

export function slotKey(date: Date): number {
  return Math.floor(date.getTime() / 60_000)
}

export function sameSlot(a: Date, b: Date): boolean {
  return slotKey(a) === slotKey(b)
}

/**
 * The first slot after `from` that is not in `taken` (compared to the minute).
 * Returns null when nothing is free within the search horizon.
 */
export function nextFreeSlot(settings: SlotSettings, from: Date, taken: Date[], opts: { maxDays?: number } = {}): Date | null {
  const takenKeys = new Set(taken.map(slotKey))
  const slots = upcomingSlots(settings, from, { count: takenKeys.size + 60, maxDays: opts.maxDays ?? 365 })
  return slots.find((s) => !takenKeys.has(slotKey(s))) ?? null
}

export function timezoneAbbreviation(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normalizeTimezone(timezone),
      timeZoneName: 'short',
    }).formatToParts(date)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** 'Tue, 9:30' in the given timezone (toast copy). */
export function formatSlot(date: Date, timezone: string): string {
  return format(new TZDate(date.getTime(), normalizeTimezone(timezone)), 'EEE, H:mm')
}

/** 'Tue, 4 Nov at 9:30 IST' for emails. */
export function formatSlotLong(date: Date, timezone: string): string {
  const tz = normalizeTimezone(timezone)
  const local = new TZDate(date.getTime(), tz)
  const abbr = timezoneAbbreviation(date, tz)
  return `${format(local, "EEE, d MMM 'at' H:mm")}${abbr ? ` ${abbr}` : ''}`
}

/** 'YYYY-MM-DD' of `date` in the timezone. */
export function localDateKey(date: Date, timezone: string): string {
  const p = localParts(date, timezone)
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
