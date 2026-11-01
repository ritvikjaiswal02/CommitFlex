import { TZDate } from '@date-fns/tz'
import { addDays } from 'date-fns'
import type { AutopilotCadence } from '@/types/autopilot'
import { parseTime, safeTimeZone } from '@/components/app/format'

/**
 * Posting slots as the app shows them: `post_days` at `post_time` in the
 * profile timezone, or every day for `ship_moments` (PRODUCT_SPEC §5 Flow F).
 * Pure and client-safe; the server's planner owns the real assignment.
 */

export interface SlotRule {
  cadence: AutopilotCadence
  postDays: number[]
  postTime: string
  timezone: string
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function slotDays(rule: Pick<SlotRule, 'cadence' | 'postDays'>): number[] {
  if (rule.cadence === 'ship_moments') return [0, 1, 2, 3, 4, 5, 6]
  const days = Array.from(new Set(rule.postDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)))
  return days.sort((a, b) => a - b)
}

/** The next `count` slot instants after `from`, looking at most 5 weeks ahead. */
export function computeNextSlots(rule: SlotRule, from: Date = new Date(), count = 5): Date[] {
  const time = parseTime(rule.postTime) ?? { hours: 9, minutes: 0 }
  const days = new Set(slotDays(rule))
  if (days.size === 0 || count <= 0) return []
  const tz = safeTimeZone(rule.timezone)
  const start = new TZDate(from.getTime(), tz)
  const slots: Date[] = []
  for (let offset = 0; offset < 36 && slots.length < count; offset++) {
    const day = addDays(start, offset)
    if (!days.has(day.getDay())) continue
    const slot = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), time.hours, time.minutes, 0, 0, tz)
    if (slot.getTime() > from.getTime()) slots.push(new Date(slot.getTime()))
  }
  return slots
}

function joinDays(days: number[]): string {
  const names = days.map((d) => DAY_SHORT[d])
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Plain-language cadence, e.g. "Twice a week, Tue and Thu at 09:00". */
export function describeCadence(rule: Pick<SlotRule, 'cadence' | 'postDays' | 'postTime'>): string {
  const at = `at ${rule.postTime}`
  switch (rule.cadence) {
    case 'ship_moments':
      return `When you ship, posted at the next ${rule.postTime}`
    case 'weekdays':
      return `Every weekday ${at}`
    case 'weekly':
      return `Once a week, ${joinDays(slotDays(rule))} ${at}`
    case 'twice_weekly':
      return `Twice a week, ${joinDays(slotDays(rule))} ${at}`
    case 'three_weekly':
      return `Three times a week, ${joinDays(slotDays(rule))} ${at}`
    default:
      return `${joinDays(slotDays(rule))} ${at}`
  }
}

export const CADENCE_SHORT: Record<AutopilotCadence, string> = {
  ship_moments: 'Ship moments only',
  weekly: 'Once a week',
  twice_weekly: 'Twice a week',
  three_weekly: 'Three times a week',
  weekdays: 'Every weekday',
}
