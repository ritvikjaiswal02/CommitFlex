import { describe, it, expect } from 'vitest'
import {
  groupByDay,
  inAnchorMonth,
  isCalendarView,
  normalizeAnchor,
  rangeFor,
  rangeTitle,
  shiftAnchor,
} from '@/components/app/calendar-utils'

describe('rangeFor', () => {
  it('builds a Monday-first week', () => {
    const range = rangeFor('week', '2026-11-04', 'UTC')
    expect(range.days).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ])
    expect(range.start.toISOString()).toBe('2026-11-02T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-11-09T00:00:00.000Z')
  })

  it('uses the timezone for day boundaries', () => {
    const range = rangeFor('week', '2026-11-04', 'Asia/Kolkata')
    expect(range.start.toISOString()).toBe('2026-11-01T18:30:00.000Z')
  })

  it('builds whole weeks around a month', () => {
    const range = rangeFor('month', '2026-11-15', 'UTC')
    expect(range.days[0]).toBe('2026-10-26')
    expect(range.days[range.days.length - 1]).toBe('2026-12-06')
    expect(range.days.length % 7).toBe(0)
  })
})

describe('navigation', () => {
  it('shifts by a week or a month', () => {
    expect(shiftAnchor('week', '2026-11-04', 1, 'UTC')).toBe('2026-11-11')
    expect(shiftAnchor('week', '2026-11-04', -1, 'UTC')).toBe('2026-10-28')
    expect(shiftAnchor('month', '2026-01-31', 1, 'UTC')).toBe('2026-02-28')
  })

  it('titles ranges', () => {
    expect(rangeTitle('month', '2026-11-04', 'UTC')).toBe('November 2026')
    expect(rangeTitle('week', '2026-11-04', 'UTC')).toBe('2 – 8 Nov 2026')
    expect(rangeTitle('week', '2026-12-01', 'UTC')).toBe('30 Nov – 6 Dec 2026')
    expect(rangeTitle('week', '2026-12-30', 'UTC')).toBe('28 Dec 2026 – 3 Jan 2027')
  })

  it('normalizes anchors', () => {
    const now = new Date('2026-11-03T04:30:00Z')
    expect(normalizeAnchor('2026-01-02', 'UTC', now)).toBe('2026-01-02')
    expect(normalizeAnchor('garbage', 'UTC', now)).toBe('2026-11-03')
    expect(normalizeAnchor(undefined, 'UTC', now)).toBe('2026-11-03')
  })

  it('checks view names and month membership', () => {
    expect(isCalendarView('week')).toBe(true)
    expect(isCalendarView('day')).toBe(false)
    expect(inAnchorMonth('2026-11-30', '2026-11-04')).toBe(true)
    expect(inAnchorMonth('2026-12-01', '2026-11-04')).toBe(false)
  })
})

describe('groupByDay', () => {
  it('groups by the zoned day and skips undated items', () => {
    const items = [
      { id: 'a', at: '2026-11-02T20:00:00Z' },
      { id: 'b', at: '2026-11-03T05:00:00Z' },
      { id: 'c', at: null },
    ]
    const grouped = groupByDay(items, (i) => i.at, 'Asia/Kolkata')
    expect(grouped.get('2026-11-03')?.map((i) => i.id)).toEqual(['a', 'b'])
    expect(grouped.size).toBe(1)
  })
})
