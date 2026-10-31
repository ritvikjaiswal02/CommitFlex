import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A chainable stand-in for the Drizzle query builder. Every builder method
 * returns the chain; awaiting the chain resolves the next queued result.
 */
const mock = vi.hoisted(() => {
  const results: unknown[] = []
  const calls: { method: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {}
  const methods = [
    'select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'onConflictDoUpdate',
    'onConflictDoNothing', 'returning', 'update', 'set', 'delete',
  ]
  for (const m of methods) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    const next = results.shift()
    return next instanceof Error ? Promise.reject(next).then(resolve, reject) : Promise.resolve(next ?? []).then(resolve, reject)
  }
  return { results, calls, db: chain }
})
vi.mock('@/lib/db/client', () => ({ db: mock.db }))

import {
  countUsage,
  getEntitledSubscription,
  getTrialEndsAt,
  incrementUsageCounter,
  recordBillingEvent,
  updateSubscription,
} from '@/lib/db/queries/billing'
import { createApiToken, listApiTokens, revokeApiToken, findActiveTokenByHash } from '@/lib/db/queries/tokens'

beforeEach(() => {
  mock.results.length = 0
  mock.calls.length = 0
})

describe('countUsage', () => {
  it('counts rows for row-backed limits', async () => {
    for (const key of ['repos', 'voiceProfiles', 'queuedPosts', 'extensionTokens'] as const) {
      mock.results.push([{ n: 3 }])
      expect(await countUsage('u1', key, '2026-11')).toBe(3)
    }
  })

  it('reads the monthly counter for generations', async () => {
    mock.results.push([{ n: 7 }])
    expect(await countUsage('u1', 'generationsPerMonth', '2026-11')).toBe(7)
    mock.results.push([])
    expect(await countUsage('u1', 'generationsPerMonth', '2026-12')).toBe(0)
  })

  it('counts reviewer emails', async () => {
    mock.results.push([{ emails: ['a@x.dev', 'b@x.dev'] }])
    expect(await countUsage('u1', 'reviewers', '2026-11')).toBe(2)
    mock.results.push([])
    expect(await countUsage('u1', 'reviewers', '2026-11')).toBe(0)
  })
})

describe('incrementUsageCounter', () => {
  it('upserts and returns the new count', async () => {
    mock.results.push([{ count: 5 }])
    expect(await incrementUsageCounter('u1', 'generations', '2026-11', 1)).toBe(5)
    expect(mock.calls.some((c) => c.method === 'onConflictDoUpdate')).toBe(true)
  })
})

describe('subscriptions', () => {
  it('picks the entitled subscription from the user rows', async () => {
    const now = new Date()
    mock.results.push([
      { id: 'a', plan: 'pro', status: 'created', currentPeriodEnd: null, cancelAtPeriodEnd: false, updatedAt: now },
      { id: 'b', plan: 'pro', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false, updatedAt: now },
    ])
    expect((await getEntitledSubscription('u1'))?.id).toBe('b')
    mock.results.push([])
    expect(await getEntitledSubscription('u1')).toBeNull()
  })

  it('updateSubscription strips identity fields and throws when missing', async () => {
    mock.results.push([{ id: 's1', status: 'active' }])
    await updateSubscription('s1', { status: 'active', userId: 'attacker', id: 'other' })
    const set = mock.calls.find((c) => c.method === 'set')!.args[0] as Record<string, unknown>
    expect(set.userId).toBeUndefined()
    expect(set.id).toBeUndefined()
    expect(set.status).toBe('active')
    expect(set.updatedAt).toBeInstanceOf(Date)

    mock.results.push([])
    await expect(updateSubscription('missing', { status: 'active' })).rejects.toThrow('not found')
  })

  it('reads the trial end', async () => {
    const ends = new Date()
    mock.results.push([{ trialEndsAt: ends }])
    expect(await getTrialEndsAt('u1')).toBe(ends)
    mock.results.push([])
    expect(await getTrialEndsAt('u1')).toBeNull()
  })
})

describe('recordBillingEvent', () => {
  it('reports a new event as created', async () => {
    mock.results.push([{ id: 'e1', processedAt: null }])
    const res = await recordBillingEvent({ eventId: 'evt_1', type: 'subscription.charged', payload: {} })
    expect(res).toEqual({ row: { id: 'e1', processedAt: null }, created: true })
  })

  it('returns the existing row on conflict', async () => {
    mock.results.push([], [{ id: 'e1', processedAt: new Date(0) }])
    const res = await recordBillingEvent({ eventId: 'evt_1', type: 'subscription.charged', payload: {} })
    expect(res.created).toBe(false)
    expect(res.row.id).toBe('e1')
  })
})

describe('token queries', () => {
  it('creates a token and returns the plaintext once', async () => {
    const createdAt = new Date('2026-11-01T00:00:00Z')
    mock.results.push([
      { id: 't1', name: 'Chrome on Nov 1', tokenPrefix: 'cfx_abcdefgh', scopes: ['extension'], lastUsedAt: null, createdAt, expiresAt: null },
    ])
    const { token, summary } = await createApiToken('u1', '  Chrome   on Nov 1 ')
    expect(token).toMatch(/^cfx_/)
    expect(summary).toEqual({
      id: 't1', name: 'Chrome on Nov 1', tokenPrefix: 'cfx_abcdefgh', scopes: ['extension'],
      lastUsedAt: null, createdAt: '2026-11-01T00:00:00.000Z', expiresAt: null,
    })
    const values = mock.calls.find((c) => c.method === 'values')!.args[0] as Record<string, unknown>
    expect(values.name).toBe('Chrome on Nov 1')
    expect(values.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(values.tokenHash).not.toBe(token)
    expect(values.tokenPrefix).toBe(token.slice(0, 12))
  })

  it('lists, revokes and finds tokens', async () => {
    mock.results.push([{ id: 't1', name: 'x', tokenPrefix: 'cfx_1', scopes: ['extension'], lastUsedAt: new Date(0), createdAt: new Date(0), expiresAt: null }])
    expect((await listApiTokens('u1'))[0].lastUsedAt).toBe('1970-01-01T00:00:00.000Z')
    mock.results.push([{ id: 't1' }])
    expect(await revokeApiToken('u1', 't1')).toBe(true)
    mock.results.push([])
    expect(await revokeApiToken('u1', 't1')).toBe(false)
    mock.results.push([])
    expect(await findActiveTokenByHash('h')).toBeNull()
  })
})
