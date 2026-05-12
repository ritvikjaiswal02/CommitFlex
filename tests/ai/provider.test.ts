import { describe, it, expect, beforeEach } from 'vitest'
import { CircuitBreaker } from '@/lib/ai/provider'

function makeBreaker(overrides?: Partial<ConstructorParameters<typeof CircuitBreaker>[0]>) {
  return new CircuitBreaker({
    threshold: 0.5,
    windowMs: 300_000,
    cooldownMs: 120_000,
    minSamples: 4,
    ...overrides,
  })
}

describe('CircuitBreaker', () => {
  it('starts closed', () => {
    const cb = makeBreaker()
    expect(cb.isOpen()).toBe(false)
  })

  it('opens after failure rate exceeds threshold', () => {
    const cb = makeBreaker({ minSamples: 4, threshold: 0.5 })
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()
    cb.recordSuccess()
    // 3/4 = 0.75 >= 0.5 → open
    expect(cb.isOpen()).toBe(true)
  })

  it('stays closed below threshold', () => {
    const cb = makeBreaker({ minSamples: 4, threshold: 0.5 })
    cb.recordSuccess()
    cb.recordSuccess()
    cb.recordFailure()
    cb.recordSuccess()
    // 1/4 = 0.25 < 0.5 → closed
    expect(cb.isOpen()).toBe(false)
  })

  it('throws when open', async () => {
    const cb = makeBreaker({ minSamples: 2, threshold: 0.5 })
    cb.recordFailure()
    cb.recordFailure()
    await expect(cb.call(async () => 'ok')).rejects.toThrow('Circuit breaker is open')
  })

  it('closes after cooldown and successful call', async () => {
    const cb = makeBreaker({ minSamples: 2, threshold: 0.5, cooldownMs: 0 })
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.isOpen()).toBe(false) // cooldownMs=0, transitions to half-open immediately
    await cb.call(async () => 'success')
    expect(cb.isOpen()).toBe(false)
  })

  it('records success and failure via call()', async () => {
    const cb = makeBreaker({ minSamples: 2, threshold: 0.5 })
    await cb.call(async () => 'ok')
    await expect(cb.call(async () => { throw new Error('fail') })).rejects.toThrow('fail')
  })
})
