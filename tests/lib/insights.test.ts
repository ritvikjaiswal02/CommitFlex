import { describe, it, expect } from 'vitest'
import { cadenceTargetPerWeek, formatDuration, median, postingStreakWeeks, shipToPost, weekStart } from '@/lib/insights'

const TZ = 'Asia/Kolkata'
// Wednesday 4 Nov 2026, 12:00 IST.
const now = new Date('2026-11-04T06:30:00Z')

describe('weekStart', () => {
  it('is Monday 00:00 in the user timezone', () => {
    expect(weekStart(now, TZ).toISOString()).toBe('2026-11-01T18:30:00.000Z') // Mon 2 Nov 00:00 IST
  })
})

describe('postingStreakWeeks', () => {
  it('counts consecutive weeks with a post, ending this week', () => {
    const posts = [
      new Date('2026-11-03T04:00:00Z'), // this week
      new Date('2026-10-28T04:00:00Z'), // last week
      new Date('2026-10-20T04:00:00Z'), // two weeks ago
      new Date('2026-10-01T04:00:00Z'), // a gap before this
    ]
    expect(postingStreakWeeks(posts, TZ, now)).toBe(3)
  })

  it('does not break the streak while this week is still open', () => {
    const posts = [new Date('2026-10-28T04:00:00Z'), new Date('2026-10-21T04:00:00Z')]
    expect(postingStreakWeeks(posts, TZ, now)).toBe(2)
  })

  it('is zero after a missed week or with no posts', () => {
    expect(postingStreakWeeks([new Date('2026-10-14T04:00:00Z')], TZ, now)).toBe(0)
    expect(postingStreakWeeks([], TZ, now)).toBe(0)
  })
})

describe('shipToPost', () => {
  it('rates posted ships over non-skipped ships and takes the median lag', () => {
    const base = new Date('2026-11-01T10:00:00Z')
    const h = (n: number) => new Date(base.getTime() + n * 3600_000)
    const result = shipToPost([
      { shippedAt: base, firstPublishedAt: h(2), skipped: false },
      { shippedAt: base, firstPublishedAt: h(10), skipped: false },
      { shippedAt: base, firstPublishedAt: h(30), skipped: false },
      { shippedAt: base, firstPublishedAt: null, skipped: false },
      { shippedAt: base, firstPublishedAt: null, skipped: true },
    ])
    expect(result).toEqual({ ships: 4, posted: 3, rate: 0.75, medianLagMs: 10 * 3600_000 })
  })

  it('has no rate without ships', () => {
    expect(shipToPost([])).toEqual({ ships: 0, posted: 0, rate: null, medianLagMs: null })
  })
})

describe('helpers', () => {
  it('derives the weekly target from the cadence', () => {
    expect(cadenceTargetPerWeek('ship_moments', [2, 4])).toBeNull()
    expect(cadenceTargetPerWeek('twice_weekly', [2, 4])).toBe(2)
    expect(cadenceTargetPerWeek('weekdays', [])).toBe(5)
  })

  it('formats durations and medians', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(formatDuration(20 * 60_000)).toBe('20 min')
    expect(formatDuration(5 * 3600_000)).toBe('5 h')
    expect(formatDuration(3 * 86_400_000)).toBe('3 days')
  })
})
