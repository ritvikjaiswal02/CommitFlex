/**
 * Consistency metrics for the Insights page: what a builder posting in
 * public cares about (am I keeping it up, do my ships get posted, how fast),
 * computed from the queue and ship events. Pure functions; the queries live
 * in lib/db/queries/publish.ts.
 */
import { TZDate } from '@date-fns/tz'
import type { AutopilotCadence } from '@/types/autopilot'

const DAY_MS = 24 * 3600_000

/** Monday 00:00 (in `timezone`) of the week containing `date`, as an instant. */
export function weekStart(date: Date, timezone: string): Date {
  const local = new TZDate(date.getTime(), timezone)
  const back = (local.getDay() + 6) % 7
  return new Date(new TZDate(local.getFullYear(), local.getMonth(), local.getDate() - back, 0, 0, timezone).getTime())
}

/**
 * Consecutive weeks with at least one published post, counting back from
 * this week. The current week doesn't break a streak until it's over: if
 * nothing went out yet this week, the count starts from last week.
 */
export function postingStreakWeeks(publishedAt: Date[], timezone: string, now: Date = new Date()): number {
  if (publishedAt.length === 0) return 0
  const weeks = new Set(publishedAt.map((d) => weekStart(d, timezone).getTime()))
  let cursor = weekStart(now, timezone)
  if (!weeks.has(cursor.getTime())) cursor = weekStart(new Date(cursor.getTime() - DAY_MS), timezone)
  let streak = 0
  // Step back a week at a time; 3.5 days lands safely inside the previous week across DST.
  while (weeks.has(cursor.getTime())) {
    streak++
    cursor = weekStart(new Date(cursor.getTime() - 3.5 * DAY_MS), timezone)
  }
  return streak
}

/** Posts per week the autopilot cadence aims for, or null for ship-moments-only. */
export function cadenceTargetPerWeek(cadence: AutopilotCadence, postDays: number[]): number | null {
  if (cadence === 'ship_moments') return null
  if (postDays.length > 0) return postDays.length
  switch (cadence) {
    case 'weekly':
      return 1
    case 'twice_weekly':
      return 2
    case 'three_weekly':
      return 3
    case 'weekdays':
      return 5
    default:
      return null
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** "3 h", "1.5 days": a duration in the unit people think in. */
export function formatDuration(ms: number): string {
  const hours = ms / 3600_000
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`
  if (hours < 48) return `${Math.round(hours)} h`
  const days = hours / 24
  return `${days < 10 ? Math.round(days * 10) / 10 : Math.round(days)} days`
}

export interface ShipOutcome {
  /** When the ship event was recorded (the merge or release, via webhook). */
  shippedAt: Date
  /** First publish of a post written from it, if any. */
  firstPublishedAt: Date | null
  skipped: boolean
}

export interface ShipToPost {
  /** Non-skipped ship moments in the range. */
  ships: number
  /** Of those, how many have a published post. */
  posted: number
  /** posted / ships, 0 to 1, or null with no ships. */
  rate: number | null
  /** Median ms from ship to first post, or null. */
  medianLagMs: number | null
}

export function shipToPost(outcomes: ShipOutcome[]): ShipToPost {
  const counted = outcomes.filter((o) => !o.skipped)
  const posted = counted.filter((o) => o.firstPublishedAt)
  const lags = posted
    .map((o) => (o.firstPublishedAt as Date).getTime() - o.shippedAt.getTime())
    .filter((ms) => ms >= 0)
  return {
    ships: counted.length,
    posted: posted.length,
    rate: counted.length > 0 ? posted.length / counted.length : null,
    medianLagMs: median(lags),
  }
}
