import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Chainable Drizzle stand-in: awaiting the chain resolves the next queued result. */
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
  buildAuthorContext,
  getUserProfile,
  startTrialIfEligible,
  upsertUserProfile,
  type UserProfile,
} from '@/lib/db/queries/onboarding'

const DAY = 24 * 60 * 60 * 1000

function profile(patch: Partial<UserProfile> = {}): UserProfile {
  const now = new Date('2026-11-01T00:00:00Z')
  return {
    userId: 'u1',
    role: null,
    pitch: null,
    audiences: [],
    platforms: ['linkedin', 'twitter'],
    tonePreset: null,
    timezone: 'UTC',
    country: null,
    onboardingStep: 'repos',
    onboardedAt: null,
    notifyEmail: null,
    trialEndsAt: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  }
}

beforeEach(() => {
  mock.results.length = 0
  mock.calls.length = 0
})

describe('getUserProfile', () => {
  it('returns the row or null', async () => {
    mock.results.push([profile({ role: 'founder' })])
    expect((await getUserProfile('u1'))?.role).toBe('founder')
    mock.results.push([])
    expect(await getUserProfile('u1')).toBeNull()
  })
})

describe('upsertUserProfile', () => {
  it('upserts on user_id and drops undefined keys', async () => {
    mock.results.push([profile({ role: 'engineer' })])
    const row = await upsertUserProfile('u1', { role: 'engineer', pitch: undefined, timezone: 'Asia/Kolkata' })
    expect(row.role).toBe('engineer')
    const values = mock.calls.find((c) => c.method === 'values')?.args[0] as Record<string, unknown>
    expect(values.userId).toBe('u1')
    expect(values.role).toBe('engineer')
    expect(values.timezone).toBe('Asia/Kolkata')
    expect('pitch' in values).toBe(false)
    const set = (mock.calls.find((c) => c.method === 'onConflictDoUpdate')?.args[0] as { set: Record<string, unknown> }).set
    expect(set.role).toBe('engineer')
    expect(set.updatedAt).toBeInstanceOf(Date)
  })
})

describe('startTrialIfEligible', () => {
  const now = new Date('2026-11-01T10:00:00Z')

  it('does nothing when a trial already exists', async () => {
    mock.results.push([profile({ trialEndsAt: new Date(now.getTime() + DAY) })])
    expect(await startTrialIfEligible('u1', now)).toBeNull()
    expect(mock.calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('does nothing when the user has had a subscription', async () => {
    mock.results.push([profile()])
    mock.results.push([{ id: 'sub_1' }])
    expect(await startTrialIfEligible('u1', now)).toBeNull()
    expect(mock.calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('sets a 14-day trial once on an existing profile', async () => {
    const end = new Date(now.getTime() + 14 * DAY)
    mock.results.push([profile()])
    mock.results.push([]) // subscriptions
    mock.results.push([]) // GitHub account (none linked)
    mock.results.push([{ trialEndsAt: end }])
    expect((await startTrialIfEligible('u1', now))?.toISOString()).toBe(end.toISOString())
    const set = mock.calls.find((c) => c.method === 'set')?.args[0] as { trialEndsAt: Date }
    expect(set.trialEndsAt.toISOString()).toBe(end.toISOString())
  })

  it('creates the profile with the trial when none exists', async () => {
    const end = new Date(now.getTime() + 14 * DAY)
    mock.results.push([]) // profile
    mock.results.push([]) // subscriptions
    mock.results.push([]) // GitHub account (none linked)
    mock.results.push([{ trialEndsAt: end }])
    expect((await startTrialIfEligible('u1', now))?.toISOString()).toBe(end.toISOString())
    expect(mock.calls.some((c) => c.method === 'onConflictDoNothing')).toBe(true)
  })

  it('never grants a second trial to a GitHub account that already had one', async () => {
    mock.results.push([profile()])
    mock.results.push([]) // subscriptions
    mock.results.push([{ providerAccountId: '583231' }]) // GitHub account
    mock.results.push([{ hash: 'claimed' }]) // trial_claims hit
    expect(await startTrialIfEligible('u1', now)).toBeNull()
    expect(mock.calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('records the claim when it starts a trial for a GitHub account', async () => {
    const end = new Date(now.getTime() + 14 * DAY)
    mock.results.push([profile()])
    mock.results.push([]) // subscriptions
    mock.results.push([{ providerAccountId: '583231' }]) // GitHub account
    mock.results.push([]) // no claim yet
    mock.results.push([{ trialEndsAt: end }]) // conditional update
    mock.results.push([]) // claim insert
    expect((await startTrialIfEligible('u1', now))?.toISOString()).toBe(end.toISOString())
    const values = mock.calls.filter((c) => c.method === 'values').map((c) => c.args[0] as Record<string, unknown>)
    expect(values.some((v) => typeof v.githubAccountIdHash === 'string' && (v.githubAccountIdHash as string).length === 64)).toBe(true)
  })

  it('returns null when a concurrent request already started it', async () => {
    mock.results.push([profile()])
    mock.results.push([])
    mock.results.push([])
    expect(await startTrialIfEligible('u1', now)).toBeNull()
  })
})

describe('buildAuthorContext', () => {
  it('is empty without a profile', () => {
    expect(buildAuthorContext(null)).toBe('')
    expect(buildAuthorContext(profile())).toBe('')
  })

  it('describes role, pitch and audiences', () => {
    const ctx = buildAuthorContext(
      profile({ role: 'founder', pitch: 'An open-source feature flag service.', audiences: ['developers', 'customers'] }),
    )
    expect(ctx).toBe("Author: indie founder building 'An open-source feature flag service'. Audience: developers, customers.")
  })

  it('handles a role without a pitch and a pitch without a role', () => {
    expect(buildAuthorContext(profile({ role: 'maintainer' }))).toBe('Author: open-source maintainer.')
    expect(buildAuthorContext(profile({ pitch: 'A CLI for SQL migrations' }))).toBe(
      "Author is building 'A CLI for SQL migrations'.",
    )
  })

  it('ignores unknown roles and audiences', () => {
    expect(buildAuthorContext(profile({ role: 'wizard', audiences: ['aliens', 'users'] }))).toBe('Audience: users.')
  })
})
