import { describe, it, expect } from 'vitest'
import { creativityToTemperature } from '@/lib/ai/posts'

describe('creativityToTemperature', () => {
  it('maps 0 to the lowest band (0.3)', () => {
    expect(creativityToTemperature(0)).toBeCloseTo(0.3, 5)
  })

  it('maps 100 to the highest band (1.0)', () => {
    expect(creativityToTemperature(100)).toBeCloseTo(1.0, 5)
  })

  it('maps 50 to mid (0.65)', () => {
    expect(creativityToTemperature(50)).toBeCloseTo(0.65, 5)
  })

  it('clamps values below 0', () => {
    expect(creativityToTemperature(-30)).toBeCloseTo(0.3, 5)
  })

  it('clamps values above 100', () => {
    expect(creativityToTemperature(150)).toBeCloseTo(1.0, 5)
  })

  it('produces monotonically increasing temperatures', () => {
    const samples = [0, 25, 50, 75, 100].map(creativityToTemperature)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1])
    }
  })
})
