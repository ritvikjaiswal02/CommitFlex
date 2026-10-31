import { describe, it, expect } from 'vitest'
import {
  effectivePostDays,
  formatSlot,
  formatSlotLong,
  localDateKey,
  localParts,
  nextFreeSlot,
  normalizeTimezone,
  parsePostTime,
  sameSlot,
  upcomingSlots,
} from '@/lib/autopilot/slots'

describe('effectivePostDays', () => {
  it('uses every day for ship moments', () => {
    expect(effectivePostDays('ship_moments', [2])).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('keeps stored days that match the cadence count', () => {
    expect(effectivePostDays('twice_weekly', [4, 1])).toEqual([1, 4])
    expect(effectivePostDays('weekly', [5])).toEqual([5])
  })

  it('falls back to cadence defaults when the stored days do not fit', () => {
    expect(effectivePostDays('three_weekly', [2, 4])).toEqual([1, 3, 5])
    expect(effectivePostDays('weekdays', [])).toEqual([1, 2, 3, 4, 5])
    expect(effectivePostDays('weekly', [9])).toEqual([2])
  })
})

describe('parsePostTime and timezones', () => {
  it('parses HH:MM and clamps garbage to 09:00', () => {
    expect(parsePostTime('18:00')).toEqual({ hours: 18, minutes: 0 })
    expect(parsePostTime('12:30')).toEqual({ hours: 12, minutes: 30 })
    expect(parsePostTime('nope')).toEqual({ hours: 9, minutes: 0 })
  })

  it('normalises invalid timezones to UTC', () => {
    expect(normalizeTimezone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(normalizeTimezone('Mars/Olympus')).toBe('UTC')
    expect(normalizeTimezone(null)).toBe('UTC')
  })

  it('reads local calendar parts in the timezone', () => {
    // 2026-11-02T20:00Z is Tuesday 01:30 in Kolkata.
    const p = localParts(new Date('2026-11-02T20:00:00Z'), 'Asia/Kolkata')
    expect(p).toMatchObject({ weekday: 2, hour: 1, minute: 30, day: 3 })
    expect(localDateKey(new Date('2026-11-02T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-03')
  })
})

describe('upcomingSlots', () => {
  const base = { cadence: 'twice_weekly' as const, postDays: [2, 4], postTime: '09:00', timezone: 'Asia/Kolkata' }

  it('returns post-day slots at the local post time', () => {
    // Sunday 1 Nov 2026, 12:00 UTC.
    const slots = upcomingSlots(base, new Date('2026-11-01T12:00:00Z'), { count: 3 })
    // Tue 3 Nov 09:00 IST = 03:30 UTC; Thu 5 Nov; Tue 10 Nov.
    expect(slots.map((d) => d.toISOString())).toEqual([
      '2026-11-03T03:30:00.000Z',
      '2026-11-05T03:30:00.000Z',
      '2026-11-10T03:30:00.000Z',
    ])
  })

  it('skips a slot that already passed today', () => {
    // Tue 3 Nov 10:00 IST: today's 09:00 slot is gone.
    const slots = upcomingSlots(base, new Date('2026-11-03T04:30:00Z'), { count: 1 })
    expect(slots[0].toISOString()).toBe('2026-11-05T03:30:00.000Z')
  })

  it('respects `until`', () => {
    const slots = upcomingSlots(base, new Date('2026-11-01T12:00:00Z'), { until: new Date('2026-11-04T00:00:00Z') })
    expect(slots).toHaveLength(1)
  })

  it('handles DST in the target timezone', () => {
    const ny = { cadence: 'weekdays' as const, postDays: [1, 2, 3, 4, 5], postTime: '09:00', timezone: 'America/New_York' }
    // US DST ends Sun 1 Nov 2026. Fri 30 Oct is EDT (-4), Mon 2 Nov is EST (-5).
    const slots = upcomingSlots(ny, new Date('2026-10-30T00:00:00Z'), { count: 2 })
    expect(slots.map((d) => d.toISOString())).toEqual(['2026-10-30T13:00:00.000Z', '2026-11-02T14:00:00.000Z'])
  })
})

describe('nextFreeSlot', () => {
  const settings = { cadence: 'ship_moments' as const, postDays: [], postTime: '12:30', timezone: 'UTC' }
  const from = new Date('2026-11-01T13:00:00Z')

  it('returns the first slot when nothing is taken', () => {
    expect(nextFreeSlot(settings, from, [])?.toISOString()).toBe('2026-11-02T12:30:00.000Z')
  })

  it('skips taken slots compared to the minute', () => {
    const taken = [new Date('2026-11-02T12:30:20Z'), new Date('2026-11-03T12:30:00Z')]
    expect(nextFreeSlot(settings, from, taken)?.toISOString()).toBe('2026-11-04T12:30:00.000Z')
    expect(sameSlot(taken[0], new Date('2026-11-02T12:30:00Z'))).toBe(true)
  })
})

describe('formatting', () => {
  it('formats slots in the user timezone', () => {
    const d = new Date('2026-11-03T03:30:00Z')
    expect(formatSlot(d, 'Asia/Kolkata')).toBe('Tue, 9:00')
    expect(formatSlotLong(d, 'UTC')).toMatch(/^Tue, 3 Nov at 3:30/)
  })
})
