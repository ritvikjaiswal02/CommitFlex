import { describe, it, expect } from 'vitest'
import {
  capitalize,
  dayKey,
  formatDay,
  formatSlot,
  formatTime,
  formatWhen,
  parseDayKey,
  parseTime,
  pluralize,
  safeTimeZone,
  timeZoneAbbr,
  zonedDateTimeToUtc,
} from '@/components/app/format'

// Fixed reference: Tue 3 Nov 2026, 10:00 in Kolkata (04:30 UTC).
const NOW = new Date('2026-11-03T04:30:00.000Z')
const IST = 'Asia/Kolkata'

describe('safeTimeZone', () => {
  it('keeps a valid IANA zone', () => {
    expect(safeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
  })
  it('falls back to UTC for unknown or empty zones', () => {
    expect(safeTimeZone('Mars/Olympus')).toBe('UTC')
    expect(safeTimeZone('')).toBe('UTC')
    expect(safeTimeZone(null)).toBe('UTC')
  })
})

describe('formatting in a timezone', () => {
  it('formats time and day in the given zone', () => {
    expect(formatTime(NOW, IST)).toBe('10:00')
    expect(formatTime(NOW, 'UTC')).toBe('04:30')
    expect(formatDay(NOW, IST, NOW)).toBe('Tue, 3 Nov')
  })
  it('adds the year for other years', () => {
    expect(formatDay('2025-12-30T10:00:00Z', 'UTC', NOW)).toBe('Tue, 30 Dec 2025')
  })
  it('formats slots like "Tue, 9:30"', () => {
    expect(formatSlot('2026-11-03T04:00:00.000Z', IST)).toBe('Tue, 9:30')
  })
  it('computes the calendar day in the zone, not UTC', () => {
    // 20:00 UTC on the 2nd is already the 3rd in Kolkata.
    expect(dayKey('2026-11-02T20:00:00.000Z', IST)).toBe('2026-11-03')
    expect(dayKey('2026-11-02T20:00:00.000Z', 'UTC')).toBe('2026-11-02')
  })
})

describe('parsers', () => {
  it('parses day keys', () => {
    expect(parseDayKey('2026-11-03')).toEqual({ year: 2026, month: 11, day: 3 })
    expect(parseDayKey('2026-13-01')).toBeNull()
    expect(parseDayKey('nope')).toBeNull()
  })
  it('parses times', () => {
    expect(parseTime('09:30')).toEqual({ hours: 9, minutes: 30 })
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('9')).toBeNull()
  })
})

describe('zonedDateTimeToUtc', () => {
  it('converts a wall-clock time in a zone to the right instant', () => {
    expect(zonedDateTimeToUtc('2026-11-03', '09:30', IST)?.toISOString()).toBe('2026-11-03T04:00:00.000Z')
    expect(zonedDateTimeToUtc('2026-07-01', '09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    )
  })
  it('returns null for malformed input', () => {
    expect(zonedDateTimeToUtc('bad', '09:30', IST)).toBeNull()
    expect(zonedDateTimeToUtc('2026-11-03', '99:00', IST)).toBeNull()
  })
})

describe('formatWhen', () => {
  const at = (iso: string) => formatWhen(iso, IST, NOW)

  it('says just now within 45 seconds', () => {
    expect(at('2026-11-03T04:30:20.000Z')).toBe('just now')
  })
  it('uses minutes under an hour', () => {
    expect(at('2026-11-03T04:42:00.000Z')).toBe('in 12 min')
    expect(at('2026-11-03T04:10:00.000Z')).toBe('20 min ago')
  })
  it('uses hours under three hours on the same day', () => {
    expect(at('2026-11-03T06:30:00.000Z')).toBe('in 2 hours')
    expect(at('2026-11-03T03:30:00.000Z')).toBe('1 hour ago')
  })
  it('uses "today at" later the same day', () => {
    expect(at('2026-11-03T12:30:00.000Z')).toBe('today at 18:00')
  })
  it('uses tomorrow and yesterday', () => {
    expect(at('2026-11-04T03:30:00.000Z')).toBe('tomorrow at 09:00')
    expect(at('2026-11-02T12:30:00.000Z')).toBe('yesterday at 18:00')
  })
  it('uses the weekday within a week', () => {
    expect(at('2026-11-06T03:30:00.000Z')).toBe('Fri at 09:00')
  })
  it('falls back to a date after a week', () => {
    expect(at('2026-11-20T03:30:00.000Z')).toBe('Fri, 20 Nov')
  })
  it('returns an empty string for invalid dates', () => {
    expect(formatWhen('not a date', IST, NOW)).toBe('')
  })
})

describe('small helpers', () => {
  it('capitalizes', () => {
    expect(capitalize('tomorrow at 09:00')).toBe('Tomorrow at 09:00')
    expect(capitalize('')).toBe('')
  })
  it('pluralizes', () => {
    expect(pluralize(1, 'draft')).toBe('1 draft')
    expect(pluralize(3, 'draft')).toBe('3 drafts')
    expect(pluralize(2, 'reply', 'replies')).toBe('2 replies')
  })
  it('names the timezone', () => {
    expect(timeZoneAbbr('UTC', NOW)).toMatch(/UTC|GMT/)
    expect(timeZoneAbbr('Asia/Kolkata', NOW)).toMatch(/GMT\+5:30|IST/)
  })
})
