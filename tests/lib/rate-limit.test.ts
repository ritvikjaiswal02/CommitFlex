import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows requests under the limit', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    const config = { windowMs: 60_000, max: 3 }
    const r1 = checkRateLimit('test-key-1', config)
    const r2 = checkRateLimit('test-key-1', config)
    const r3 = checkRateLimit('test-key-1', config)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('blocks requests over the limit', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    const config = { windowMs: 60_000, max: 2 }
    checkRateLimit('test-key-2', config)
    checkRateLimit('test-key-2', config)
    const r3 = checkRateLimit('test-key-2', config)
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
  })

  it('resets after window expires', async () => {
    vi.useFakeTimers()
    const { checkRateLimit } = await import('@/lib/rate-limit')
    const config = { windowMs: 1000, max: 1 }
    checkRateLimit('test-key-3', config)
    const blocked = checkRateLimit('test-key-3', config)
    expect(blocked.allowed).toBe(false)

    vi.advanceTimersByTime(1001)
    const reset = checkRateLimit('test-key-3', config)
    expect(reset.allowed).toBe(true)
    vi.useRealTimers()
  })

  it('uses separate buckets per key', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit')
    const config = { windowMs: 60_000, max: 1 }
    checkRateLimit('user-a', config)
    const blocked = checkRateLimit('user-a', config)
    const allowed = checkRateLimit('user-b', config)
    expect(blocked.allowed).toBe(false)
    expect(allowed.allowed).toBe(true)
  })
})
