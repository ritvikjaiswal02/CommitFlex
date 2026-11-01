import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/* ------------------------------------------------------------------ mocks */

const tokenAuth = vi.hoisted(() => ({ authenticateApiToken: vi.fn() }))
vi.mock('@/lib/auth/api-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/api-token')>()
  return { ...actual, authenticateApiToken: tokenAuth.authenticateApiToken }
})

const plans = vi.hoisted(() => {
  class PlanError extends Error {
    readonly status = 402 as const
    constructor(public body: Record<string, unknown>) {
      super(String(body.error))
      this.name = 'PlanError'
    }
  }
  return {
    PlanError,
    getUserPlan: vi.fn(),
    getUsage: vi.fn(),
    assertFeature: vi.fn(),
    assertWithinLimit: vi.fn(),
    limitFor: vi.fn(),
    planErrorToResponse: vi.fn((err: unknown) =>
      err instanceof PlanError ? Response.json(err.body, { status: 402 }) : null,
    ),
  }
})
vi.mock('@/lib/plans', () => plans)

const queueActions = vi.hoisted(() => {
  class QueueError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  }
  return {
    QueueError,
    recordManualPublish: vi.fn(),
    queueErrorToResponse: vi.fn((err: unknown) =>
      err instanceof QueueError ? Response.json({ error: err.message, code: err.code }, { status: err.status }) : null,
    ),
  }
})
vi.mock('@/lib/autopilot/queue', () => queueActions)

const autopilotQueries = vi.hoisted(() => ({ listQueue: vi.fn(), getQueueItemByDraft: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => autopilotQueries)

const draftQueries = vi.hoisted(() => ({ getDraft: vi.fn(), listRecentDrafts: vi.fn(), getDraftsByJob: vi.fn() }))
vi.mock('@/lib/db/queries/drafts', () => draftQueries)

const jobQueries = vi.hoisted(() => ({ getJob: vi.fn() }))
vi.mock('@/lib/db/queries/jobs', () => jobQueries)

const repoQueries = vi.hoisted(() => ({ getRepo: vi.fn(), getUserRepoByFullName: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => repoQueries)

const pipeline = vi.hoisted(() => ({ startGenerationJob: vi.fn() }))
vi.mock('@/lib/pipeline/start', () => pipeline)

const rateLimit = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 5, resetAt: Date.now() + 60_000 })),
}))
vi.mock('@/lib/rate-limit', () => rateLimit)

vi.mock('@/lib/github/url', () => ({
  parseGithubUrl: (input: string) => {
    const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(pull|releases\/tag)\/([^/?#]+))?\/?$/.exec(input.trim())
    if (!m) return null
    const [, owner, repo, kind, ref] = m
    if (kind === 'pull') return { kind: 'pr', owner, repo, number: Number(ref), url: `https://github.com/${owner}/${repo}/pull/${ref}` }
    if (kind === 'releases/tag') return { kind: 'release', owner, repo, tag: decodeURIComponent(ref), url: input }
    return { kind: 'repo', owner, repo, url: `https://github.com/${owner}/${repo}` }
  },
}))

vi.mock('@/lib/publish/intents', () => ({
  composePostText: (content: string, hashtags: string[]) =>
    [content, hashtags.filter((h) => !content.includes(h)).join(' ')].filter(Boolean).join('\n\n'),
  buildXIntentUrl: (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
  buildLinkedInComposeUrl: (text: string) =>
    `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
}))

const userLookup = vi.hoisted(() => ({ getExtensionUser: vi.fn() }))
vi.mock('@/app/api/extension/_lib/user', () => userLookup)

import { GET as whoami, OPTIONS as whoamiOptions } from '@/app/api/extension/whoami/route'
import { GET as getQueue } from '@/app/api/extension/queue/route'
import { POST as markPosted, OPTIONS as postedOptions } from '@/app/api/extension/drafts/[draftId]/posted/route'
import { POST as draftFromGithub } from '@/app/api/extension/draft-from-github/route'
import { GET as getJobStatus } from '@/app/api/extension/jobs/[jobId]/route'
import { sortQueueForExtension } from '@/app/api/extension/_lib/items'

/* --------------------------------------------------------------- fixtures */

const USER = 'user-1'
const DRAFT_ID = '7d1c7a52-5a3e-4a59-9d1f-0a6c2c0a1b11'
const JOB_ID = '0f0c2a0e-58f1-4a5c-9a7b-6a3f1d2e3c4b'
const REPO_ID = 'a1b2c3d4-0000-4000-8000-000000000001'

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-1', draftId: DRAFT_ID, jobId: JOB_ID, repoId: REPO_ID, repoFullName: 'ritvik/commitflex',
    platform: 'linkedin', status: 'scheduled', content: 'Shipped retries for webhooks', hashtags: ['#buildinpublic'],
    scheduledFor: '2026-11-03T09:00:00.000Z', approvedAt: null, publishedAt: null, publishMethod: null,
    externalUrl: null, lastError: null, trigger: 'pr_merged', sourceTitle: 'Retry webhooks',
    createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', ...overrides,
  }
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pro', definition: { name: 'Pro' }, status: 'trialing', interval: null, currency: null,
    currentPeriodEnd: null, trialEndsAt: new Date('2026-11-14T00:00:00.000Z'), subscriptionId: null, ...overrides,
  }
}

function tokenRequest(path: string, init: RequestInit = {}, token = 'cfx_test') {
  return new Request(`https://app.test${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function expectCors(res: Response) {
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_URL = 'https://app.test'
  tokenAuth.authenticateApiToken.mockResolvedValue({ userId: USER, tokenId: 'tok-1', scopes: ['extension'] })
  rateLimit.checkRateLimit.mockReturnValue({ allowed: true, remaining: 5, resetAt: Date.now() + 60_000 })
})

afterEach(() => {
  delete process.env.APP_URL
})

/* ------------------------------------------------------------------ tests */

describe('CORS preflight', () => {
  it('answers OPTIONS with 204 and CORS headers', async () => {
    for (const handler of [whoamiOptions, postedOptions]) {
      const res = handler()
      expect(res.status).toBe(204)
      expectCors(res)
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    }
  })
})

describe('GET /api/extension/whoami', () => {
  it('returns 401 with CORS headers when the token is missing or invalid', async () => {
    tokenAuth.authenticateApiToken.mockResolvedValue(null)
    const res = await whoami(tokenRequest('/api/extension/whoami'))
    expect(res.status).toBe(401)
    expectCors(res)
    expect((await res.json()).code).toBe('unauthorized')
  })

  it('asks for the extension scope', async () => {
    tokenAuth.authenticateApiToken.mockResolvedValue(null)
    await whoami(tokenRequest('/api/extension/whoami'))
    expect(tokenAuth.authenticateApiToken).toHaveBeenCalledWith(expect.any(Request), 'extension')
  })

  it('returns the user, plan, usage and app URL', async () => {
    userLookup.getExtensionUser.mockResolvedValue({ id: USER, name: 'Ritvik', email: 'r@example.com', image: null })
    plans.getUserPlan.mockResolvedValue(plan())
    plans.getUsage.mockResolvedValue({
      period: '2026-11',
      items: {
        generationsPerMonth: { used: 7, max: 150 },
        queuedPosts: { used: 2, max: 60 },
        repos: { used: 1, max: 10 }, voiceProfiles: { used: 1, max: 5 }, extensionTokens: { used: 1, max: 5 }, reviewers: { used: 0, max: 0 },
      },
    })

    const res = await whoami(tokenRequest('/api/extension/whoami'))
    expect(res.status).toBe(200)
    expectCors(res)
    const data = await res.json()
    expect(data.user).toEqual({ id: USER, name: 'Ritvik', email: 'r@example.com', image: null })
    expect(data.plan).toMatchObject({ id: 'pro', name: 'Pro', status: 'trialing' })
    expect(data.usage.generations).toEqual({ used: 7, max: 150 })
    expect(data.appUrl).toBe('https://app.test')
    expect(plans.getUsage).toHaveBeenCalledWith(USER, expect.objectContaining({ id: 'pro' }))
  })

  it('treats a token whose user no longer exists as unauthorized', async () => {
    userLookup.getExtensionUser.mockResolvedValue(null)
    const res = await whoami(tokenRequest('/api/extension/whoami'))
    expect(res.status).toBe(401)
  })

  it('maps unexpected errors to a 500 with CORS headers', async () => {
    userLookup.getExtensionUser.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await whoami(tokenRequest('/api/extension/whoami'))
    expect(res.status).toBe(500)
    expectCors(res)
    expect((await res.json()).code).toBe('internal_error')
    spy.mockRestore()
  })
})

describe('GET /api/extension/queue', () => {
  it('returns 401 without a token', async () => {
    tokenAuth.authenticateApiToken.mockResolvedValue(null)
    const res = await getQueue(tokenRequest('/api/extension/queue'))
    expect(res.status).toBe(401)
  })

  it('rejects an unknown platform', async () => {
    const res = await getQueue(tokenRequest('/api/extension/queue?platform=facebook'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_request')
  })

  it('lists ready items first and recent unqueued drafts', async () => {
    autopilotQueries.listQueue.mockResolvedValue([
      queueItem({ id: 'q-review', draftId: 'd-review', status: 'pending_review', scheduledFor: '2026-11-02T09:00:00.000Z' }),
      queueItem({ id: 'q-late', draftId: 'd-late', status: 'scheduled', scheduledFor: '2026-11-05T09:00:00.000Z' }),
      queueItem({ id: 'q-ready', draftId: 'd-ready', status: 'ready', scheduledFor: '2026-11-01T09:00:00.000Z' }),
      queueItem({ id: 'q-soon', draftId: 'd-soon', status: 'scheduled', scheduledFor: '2026-11-02T12:30:00.000Z' }),
    ])
    draftQueries.listRecentDrafts.mockResolvedValue([
      {
        id: 'd-recent', jobId: 'job-2', platform: 'linkedin', status: 'generated', content: 'A recent draft',
        hashtags: ['#oss'], repoFullName: 'ritvik/commitflex', queueStatus: null, createdAt: '2026-10-30T10:00:00.000Z',
      },
    ])

    const res = await getQueue(tokenRequest('/api/extension/queue?platform=linkedin'))
    expect(res.status).toBe(200)
    expectCors(res)
    const data = await res.json()

    expect(autopilotQueries.listQueue).toHaveBeenCalledWith(USER, {
      statuses: ['ready', 'scheduled', 'pending_review'],
      platform: 'linkedin',
      limit: 50,
    })
    expect(draftQueries.listRecentDrafts).toHaveBeenCalledWith(USER, { platform: 'linkedin', limit: 10, unqueuedOnly: true })
    expect(data.queue.map((i: { queueItemId: string }) => i.queueItemId)).toEqual(['q-ready', 'q-soon', 'q-late', 'q-review'])
    expect(data.counts).toEqual({ ready: 1, scheduled: 2, pendingReview: 1 })

    const ready = data.queue[0]
    expect(ready).toMatchObject({
      draftId: 'd-ready', platform: 'linkedin', status: 'ready', repoFullName: 'ritvik/commitflex',
      appUrl: `https://app.test/jobs/${JOB_ID}`,
    })
    expect(ready.text).toContain('Shipped retries for webhooks')
    expect(ready.text).toContain('#buildinpublic')
    expect(ready.intentUrl).toMatch(/^https:\/\/www\.linkedin\.com\/feed\/\?shareActive=true&text=/)

    expect(data.recent).toHaveLength(1)
    expect(data.recent[0]).toMatchObject({ draftId: 'd-recent', status: 'draft', queueItemId: null, appUrl: 'https://app.test/jobs/job-2' })
  })

  it('builds X intent URLs for twitter items and passes no platform when unfiltered', async () => {
    autopilotQueries.listQueue.mockResolvedValue([queueItem({ platform: 'twitter', status: 'ready' })])
    draftQueries.listRecentDrafts.mockResolvedValue([])
    const res = await getQueue(tokenRequest('/api/extension/queue'))
    const data = await res.json()
    expect(autopilotQueries.listQueue).toHaveBeenCalledWith(USER, expect.objectContaining({ platform: undefined }))
    expect(data.queue[0].intentUrl).toMatch(/^https:\/\/x\.com\/intent\/post\?text=/)
  })

  it('never repeats a queued draft under recent', async () => {
    autopilotQueries.listQueue.mockResolvedValue([queueItem({ status: 'ready' })])
    draftQueries.listRecentDrafts.mockResolvedValue([
      { id: DRAFT_ID, jobId: JOB_ID, platform: 'linkedin', status: 'generated', content: 'dup', hashtags: [], repoFullName: 'r/r', queueStatus: 'ready', createdAt: '2026-11-01T00:00:00.000Z' },
    ])
    const data = await (await getQueue(tokenRequest('/api/extension/queue'))).json()
    expect(data.recent).toHaveLength(0)
  })
})

describe('POST /api/extension/drafts/:draftId/posted', () => {
  const params = { params: { draftId: DRAFT_ID } }
  const post = (body?: unknown, draftId = DRAFT_ID) =>
    markPosted(
      tokenRequest(`/api/extension/drafts/${draftId}/posted`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
      { params: { draftId } },
    )

  it('returns 401 without a token', async () => {
    tokenAuth.authenticateApiToken.mockResolvedValue(null)
    const res = await markPosted(tokenRequest(`/api/extension/drafts/${DRAFT_ID}/posted`, { method: 'POST' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 404 for a draft owned by someone else', async () => {
    draftQueries.getDraft.mockResolvedValue({ id: DRAFT_ID, userId: 'someone-else', deletedAt: null })
    const res = await post({})
    expect(res.status).toBe(404)
    expect(queueActions.recordManualPublish).not.toHaveBeenCalled()
  })

  it('returns 404 for a malformed id without querying', async () => {
    const res = await post({}, 'not-a-uuid')
    expect(res.status).toBe(404)
    expect(draftQueries.getDraft).not.toHaveBeenCalled()
  })

  it('rejects a non-https url', async () => {
    const res = await post({ url: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
  })

  it('records the publish with method extension and returns the item', async () => {
    draftQueries.getDraft.mockResolvedValue({ id: DRAFT_ID, userId: USER, deletedAt: null })
    queueActions.recordManualPublish.mockResolvedValue(
      queueItem({ status: 'published', publishMethod: 'extension', externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1/' }),
    )
    const res = await post({ url: 'https://www.linkedin.com/feed/update/urn:li:share:1/' })
    expect(res.status).toBe(200)
    expectCors(res)
    expect(queueActions.recordManualPublish).toHaveBeenCalledWith({
      userId: USER, draftId: DRAFT_ID, method: 'extension', externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:1/',
    })
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.item).toMatchObject({ draftId: DRAFT_ID, status: 'published' })
  })

  it('accepts an empty body', async () => {
    draftQueries.getDraft.mockResolvedValue({ id: DRAFT_ID, userId: USER, deletedAt: null })
    queueActions.recordManualPublish.mockResolvedValue(queueItem({ status: 'published' }))
    const res = await post(undefined)
    expect(res.status).toBe(200)
    expect(queueActions.recordManualPublish).toHaveBeenCalledWith(expect.objectContaining({ externalUrl: null }))
  })

  it('passes queue errors through with CORS headers', async () => {
    draftQueries.getDraft.mockResolvedValue({ id: DRAFT_ID, userId: USER, deletedAt: null })
    queueActions.recordManualPublish.mockRejectedValue(new queueActions.QueueError(409, 'invalid_state', 'Already published'))
    const res = await post({})
    expect(res.status).toBe(409)
    expectCors(res)
    expect((await res.json()).code).toBe('invalid_state')
  })
})

describe('POST /api/extension/draft-from-github', () => {
  const post = (body: unknown) =>
    draftFromGithub(tokenRequest('/api/extension/draft-from-github', { method: 'POST', body: JSON.stringify(body) }))

  beforeEach(() => {
    plans.assertFeature.mockResolvedValue(plan())
    repoQueries.getUserRepoByFullName.mockResolvedValue({ id: REPO_ID, fullName: 'ritvik/commitflex', deletedAt: null })
    pipeline.startGenerationJob.mockResolvedValue({ ok: true, jobId: JOB_ID })
  })

  it('returns 401 without a token', async () => {
    tokenAuth.authenticateApiToken.mockResolvedValue(null)
    const res = await post({ url: 'https://github.com/ritvik/commitflex/pull/42' })
    expect(res.status).toBe(401)
  })

  it('validates the body', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_request')
  })

  it('rejects URLs that are not GitHub PRs, releases or repos', async () => {
    const res = await post({ url: 'https://gitlab.com/ritvik/commitflex/-/merge_requests/1' })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('unsupported_url')
  })

  it('starts a PR job with the extension trigger', async () => {
    const res = await post({ url: 'https://github.com/ritvik/commitflex/pull/42' })
    expect(res.status).toBe(202)
    expectCors(res)
    expect(repoQueries.getUserRepoByFullName).toHaveBeenCalledWith(USER, 'ritvik/commitflex')
    expect(pipeline.startGenerationJob).toHaveBeenCalledWith({
      userId: USER,
      repoId: REPO_ID,
      source: { type: 'pr', ref: 'https://github.com/ritvik/commitflex/pull/42' },
      trigger: 'extension',
      autoQueue: false,
    })
    expect(await res.json()).toEqual({
      jobId: JOB_ID, kind: 'pr', repoFullName: 'ritvik/commitflex', jobUrl: `https://app.test/jobs/${JOB_ID}`,
    })
  })

  it('starts a release job keyed by tag', async () => {
    const res = await post({ url: 'https://github.com/ritvik/commitflex/releases/tag/v1.2.0' })
    expect(res.status).toBe(202)
    expect(pipeline.startGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({ source: { type: 'release', ref: 'v1.2.0' } }),
    )
  })

  it('drafts from the last 7 days for a repository URL', async () => {
    const res = await post({ url: 'https://github.com/ritvik/commitflex' })
    expect(res.status).toBe(202)
    const input = pipeline.startGenerationJob.mock.calls[0][0]
    expect(input.source.type).toBe('window')
    const span = input.source.windowEnd.getTime() - input.source.windowStart.getTime()
    expect(span).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('returns 404 repo_not_connected with a connect URL', async () => {
    repoQueries.getUserRepoByFullName.mockResolvedValue(null)
    const res = await post({ url: 'https://github.com/someone/else/pull/1' })
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data).toMatchObject({ code: 'repo_not_connected', connectUrl: '/repositories', repoFullName: 'someone/else' })
    expect(pipeline.startGenerationJob).not.toHaveBeenCalled()
  })

  it('returns 409 active_job with the running job id', async () => {
    pipeline.startGenerationJob.mockResolvedValue({ ok: false, status: 409, code: 'active_job', error: 'A job is already running', jobId: JOB_ID })
    const res = await post({ url: 'https://github.com/ritvik/commitflex/pull/42' })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data).toMatchObject({ code: 'active_job', jobId: JOB_ID, jobUrl: `https://app.test/jobs/${JOB_ID}` })
  })

  it('returns the plan error body when the draft limit is reached', async () => {
    const planError = { error: "You've used 10 of 10 drafts this month.", code: 'limit_reached', limit: 'generationsPerMonth', used: 10, max: 10, requiredPlan: 'pro', currentPlan: 'free' }
    pipeline.startGenerationJob.mockResolvedValue({ ok: false, status: 402, code: 'limit_reached', error: planError.error, planError })
    const res = await post({ url: 'https://github.com/ritvik/commitflex/pull/42' })
    expect(res.status).toBe(402)
    expectCors(res)
    expect(await res.json()).toEqual(planError)
  })

  it('returns 402 when the plan lacks the GitHub button feature', async () => {
    plans.assertFeature.mockRejectedValue(new plans.PlanError({ error: 'Locked', code: 'feature_locked', feature: 'extension.github_button' }))
    const res = await post({ url: 'https://github.com/ritvik/commitflex/pull/42' })
    expect(res.status).toBe(402)
    expectCors(res)
    expect(pipeline.startGenerationJob).not.toHaveBeenCalled()
  })

  it('rate limits bursts', async () => {
    rateLimit.checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 })
    const res = await post({ url: 'https://github.com/ritvik/commitflex/pull/42' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect((await res.json()).code).toBe('rate_limited')
  })
})

describe('GET /api/extension/jobs/:jobId', () => {
  const get = (jobId = JOB_ID) => getJobStatus(tokenRequest(`/api/extension/jobs/${jobId}`), { params: { jobId } })

  it('returns 404 for another user’s job', async () => {
    jobQueries.getJob.mockResolvedValue({ id: JOB_ID, userId: 'someone-else', repoId: REPO_ID, status: 'completed' })
    const res = await get()
    expect(res.status).toBe(404)
  })

  it('returns 404 for a malformed id', async () => {
    const res = await get('nope')
    expect(res.status).toBe(404)
    expect(jobQueries.getJob).not.toHaveBeenCalled()
  })

  it('reports progress while the job runs', async () => {
    jobQueries.getJob.mockResolvedValue({ id: JOB_ID, userId: USER, repoId: REPO_ID, status: 'summarizing', errorMessage: null })
    draftQueries.getDraftsByJob.mockResolvedValue([])
    repoQueries.getRepo.mockResolvedValue({ id: REPO_ID, fullName: 'ritvik/commitflex' })
    const data = await (await get()).json()
    expect(data).toMatchObject({ status: 'summarizing', done: false, drafts: [], repoFullName: 'ritvik/commitflex' })
  })

  it('returns composed drafts with queue status when complete', async () => {
    jobQueries.getJob.mockResolvedValue({ id: JOB_ID, userId: USER, repoId: REPO_ID, status: 'completed', errorMessage: null })
    repoQueries.getRepo.mockResolvedValue({ id: REPO_ID, fullName: 'ritvik/commitflex' })
    draftQueries.getDraftsByJob.mockResolvedValue([
      { id: 'd-x', jobId: JOB_ID, platform: 'twitter', originalContent: 'Short post', editedContent: null, platformMetadata: { hashtags: ['#dev'] }, createdAt: new Date('2026-11-01T10:00:00.000Z') },
      { id: 'd-li', jobId: JOB_ID, platform: 'linkedin', originalContent: 'Original', editedContent: 'Edited long post', platformMetadata: {}, createdAt: new Date('2026-11-01T10:00:00.000Z') },
    ])
    autopilotQueries.getQueueItemByDraft.mockImplementation(async (_u: string, draftId: string) =>
      draftId === 'd-li' ? queueItem({ id: 'q-li', draftId: 'd-li', status: 'pending_review' }) : null,
    )

    const res = await get()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.done).toBe(true)
    expect(data.jobUrl).toBe(`https://app.test/jobs/${JOB_ID}`)
    expect(data.drafts.map((d: { draftId: string }) => d.draftId)).toEqual(['d-li', 'd-x'])
    expect(data.drafts[0]).toMatchObject({ status: 'pending_review', queueItemId: 'q-li', text: 'Edited long post' })
    expect(data.drafts[1]).toMatchObject({ status: 'draft', queueItemId: null, platform: 'twitter' })
    expect(data.drafts[1].text).toContain('#dev')
    expect(data.drafts[1].createdAt).toBe('2026-11-01T10:00:00.000Z')
  })

  it('surfaces the error message for failed jobs', async () => {
    jobQueries.getJob.mockResolvedValue({ id: JOB_ID, userId: USER, repoId: REPO_ID, status: 'failed', errorMessage: 'No commits in this pull request' })
    draftQueries.getDraftsByJob.mockResolvedValue([])
    repoQueries.getRepo.mockResolvedValue(null)
    const data = await (await get()).json()
    expect(data).toMatchObject({ done: true, errorMessage: 'No commits in this pull request', repoFullName: '' })
  })
})

describe('sortQueueForExtension', () => {
  it('puts unscheduled items after scheduled ones within a status', () => {
    const sorted = sortQueueForExtension([
      { status: 'pending_review', scheduledFor: null, createdAt: '2026-11-01T00:00:00.000Z' },
      { status: 'pending_review', scheduledFor: '2026-11-04T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z' },
      { status: 'ready', scheduledFor: null, createdAt: '2026-10-01T00:00:00.000Z' },
    ])
    expect(sorted.map((i) => `${i.status}:${i.scheduledFor ?? 'none'}`)).toEqual([
      'ready:none',
      'pending_review:2026-11-04T00:00:00.000Z',
      'pending_review:none',
    ])
  })
})
