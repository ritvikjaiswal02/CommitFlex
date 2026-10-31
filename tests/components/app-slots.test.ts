import { describe, it, expect } from 'vitest'
import { computeNextSlots, describeCadence, slotDays } from '@/components/app/slots'

// Tue 3 Nov 2026, 10:00 in Kolkata.
const NOW = new Date('2026-11-03T04:30:00.000Z')

describe('slotDays', () => {
  it('uses every day for ship moments', () => {
    expect(slotDays({ cadence: 'ship_moments', postDays: [2] })).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
  it('dedupes, sorts and drops invalid days', () => {
    expect(slotDays({ cadence: 'twice_weekly', postDays: [4, 2, 2, 9, -1] })).toEqual([2, 4])
  })
})

describe('computeNextSlots', () => {
  it('skips a slot that already passed today', () => {
    const slots = computeNextSlots(
      { cadence: 'twice_weekly', postDays: [2, 4], postTime: '09:00', timezone: 'Asia/Kolkata' },
      NOW,
      3,
    )
    // Tue 09:00 IST has passed (it is 10:00), so Thu, next Tue, next Thu.
    expect(slots.map((d) => d.toISOString())).toEqual([
      '2026-11-05T03:30:00.000Z',
      '2026-11-10T03:30:00.000Z',
      '2026-11-12T03:30:00.000Z',
    ])
  })

  it('includes a slot later today', () => {
    const slots = computeNextSlots(
      { cadence: 'ship_moments', postDays: [], postTime: '18:00', timezone: 'Asia/Kolkata' },
      NOW,
      2,
    )
    expect(slots.map((d) => d.toISOString())).toEqual(['2026-11-03T12:30:00.000Z', '2026-11-04T12:30:00.000Z'])
  })

  it('returns nothing without days or count', () => {
    expect(computeNextSlots({ cadence: 'weekly', postDays: [], postTime: '09:00', timezone: 'UTC' }, NOW)).toEqual([])
    expect(
      computeNextSlots({ cadence: 'weekdays', postDays: [1], postTime: '09:00', timezone: 'UTC' }, NOW, 0),
    ).toEqual([])
  })

  it('falls back to 09:00 for a malformed time', () => {
    const [first] = computeNextSlots({ cadence: 'weekly', postDays: [3], postTime: 'soon', timezone: 'UTC' }, NOW, 1)
    expect(first.toISOString()).toBe('2026-11-04T09:00:00.000Z')
  })
})

describe('describeCadence', () => {
  it('describes each cadence in plain words', () => {
    expect(describeCadence({ cadence: 'twice_weekly', postDays: [2, 4], postTime: '09:00' })).toBe(
      'Twice a week, Tue and Thu at 09:00',
    )
    expect(describeCadence({ cadence: 'three_weekly', postDays: [1, 3, 5], postTime: '12:30' })).toBe(
      'Three times a week, Mon, Wed and Fri at 12:30',
    )
    expect(describeCadence({ cadence: 'weekdays', postDays: [], postTime: '18:00' })).toBe('Every weekday at 18:00')
    expect(describeCadence({ cadence: 'ship_moments', postDays: [], postTime: '09:00' })).toContain('When you ship')
  })
})
