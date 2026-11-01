import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

vi.mock('@/lib/db/queries/repos', () => ({ listReposByGithubRepoId: vi.fn() }))
vi.mock('@/lib/autopilot/limits', () => ({ isRepoWithinPlan: vi.fn(async () => true) }))
vi.mock('@/lib/db/queries/jobs', () => ({ getActiveJob: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({
  getAutopilotSettings: vi.fn(),
  insertShipEvent: vi.fn(),
  updateShipEvent: vi.fn(),
}))
vi.mock('@/lib/pipeline/start', () => ({ startGenerationJob: vi.fn() }))
vi.mock('@/lib/autopilot/emails', () => ({ sendLimitReachedOnce: vi.fn() }))
vi.mock('@/lib/plans', () => ({
  hasFeature: vi.fn(),
  limitFor: vi.fn(() => 150),
  PLANS: { free: { name: 'Free' }, pro: { name: 'Pro' }, team: { name: 'Team' } },
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { listReposByGithubRepoId } from '@/lib/db/queries/repos'
import { isRepoWithinPlan } from '@/lib/autopilot/limits'
import { getActiveJob } from '@/lib/db/queries/jobs'
import { getAutopilotSettings, insertShipEvent, updateShipEvent } from '@/lib/db/queries/autopilot'
import { startGenerationJob } from '@/lib/pipeline/start'
import { sendLimitReachedOnce } from '@/lib/autopilot/emails'
import { hasFeature } from '@/lib/plans'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from '@/app/api/webhooks/github/route'

const SECRET = 'd5b1e9a83b9b4a23a4ce3d4d5e6f78b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f6'

const baseRepo = {
  id: 'repo-uuid-1',
  userId: 'user-1',
  githubRepoId: 12345,
  name: 'widget',
  fullName: 'acme/widget',
  url: 'https://github.com/acme/widget',
  defaultBranch: 'main',
  webhookSecret: SECRET,
  webhookId: 99,
  autoGenerate: true,
  autopilotEnabled: true,
}

const settings = {
  enabled: true,
  cadence: 'ship_moments',
  postDays: [2, 4],
  postTime: '09:00',
  triggers: ['pr_merged', 'release_published', 'weekly_digest'],
  platforms: ['linkedin', 'twitter'],
  approvalMode: 'review',
  reviewerEmails: [],
  defaultVoiceProfileId: null,
  pausedUntil: null,
  timezone: 'UTC',
}

function signed(body: string, secret = SECRET) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

function req(event: string, body: string, sign = true) {
  const headers: Record<string, string> = { 'x-github-event': event }
  if (sign) headers['x-hub-signature-256'] = signed(body)
  return new Request('http://localhost/api/webhooks/github', { method: 'POST', headers, body })
}

const repository = { id: 12345, full_name: 'acme/widget', default_branch: 'main' }

function pushPayload(ref = 'refs/heads/main') {
  return JSON.stringify({
    ref,
    repository,
    head_commit: { id: 'abc123', message: 'feat: ship it', timestamp: '2026-05-13T00:00:00Z' },
    commits: [{ id: 'abc123', message: 'feat: ship it', timestamp: '2026-05-13T00:00:00Z' }],
  })
}

function prPayload(overrides: Record<string, unknown> = {}, action = 'closed') {
  return JSON.stringify({
    action,
    repository,
    pull_request: {
      number: 42,
      title: 'Retry failed webhook deliveries with backoff',
      body: 'Adds exponential backoff.',
      html_url: 'https://github.com/acme/widget/pull/42',
      merged: true,
      additions: 120,
      deletions: 30,
      user: { login: 'alice' },
      labels: [],
      base: { ref: 'main' },
      ...overrides,
    },
  })
}

function releasePayload(overrides: Record<string, unknown> = {}, action = 'published') {
  return JSON.stringify({
    action,
    repository,
    release: {
      id: 777,
      tag_name: 'v2.0.0',
      name: 'Widget 2.0',
      body: 'Big release',
      html_url: 'https://github.com/acme/widget/releases/tag/v2.0.0',
      draft: false,
      prerelease: false,
      author: { login: 'alice' },
      ...overrides,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 })
  vi.mocked(listReposByGithubRepoId).mockResolvedValue([baseRepo] as any)
  vi.mocked(getActiveJob).mockResolvedValue(null)
  vi.mocked(getAutopilotSettings).mockResolvedValue(settings as any)
  vi.mocked(insertShipEvent).mockResolvedValue({ id: 'ship-1' } as any)
  vi.mocked(hasFeature).mockResolvedValue(true)
  vi.mocked(startGenerationJob).mockResolvedValue({ ok: true, jobId: 'job-1' })
})

describe('POST /api/webhooks/github: auth and routing', () => {
  it('200s on ping events without auth', async () => {
    const res = await POST(req('ping', '{}', false))
    expect(res.status).toBe(200)
  })

  it('ignores unhandled events', async () => {
    const res = await POST(req('star', '{}', false))
    expect((await res.json()).ignored).toBe('star')
  })

  it('returns 400 on invalid JSON', async () => {
    const res = await POST(req('push', 'not json', false))
    expect(res.status).toBe(400)
  })

  it('ignores repos that are not connected', async () => {
    vi.mocked(listReposByGithubRepoId).mockResolvedValue([])
    const res = await POST(req('push', pushPayload()))
    expect((await res.json()).ignored).toBe('repo_not_connected')
  })

  it('returns 401 for a missing or wrong signature', async () => {
    expect((await POST(req('push', pushPayload(), false))).status).toBe(401)
    const body = pushPayload()
    const bad = new Request('http://localhost/api/webhooks/github', {
      method: 'POST',
      headers: { 'x-github-event': 'push', 'x-hub-signature-256': signed(body, 'wrong') },
      body,
    })
    expect((await POST(bad)).status).toBe(401)
  })

  it('returns 401 when the repo has no webhook secret', async () => {
    vi.mocked(listReposByGithubRepoId).mockResolvedValue([{ ...baseRepo, webhookSecret: null }] as any)
    expect((await POST(req('push', pushPayload()))).status).toBe(401)
  })

  it('picks the connection whose secret verifies when several users connected the repo', async () => {
    const intruder = { ...baseRepo, id: 'repo-intruder', userId: 'user-2', webhookSecret: null }
    const other = { ...baseRepo, id: 'repo-other', userId: 'user-3', webhookSecret: 'f'.repeat(64) }
    vi.mocked(listReposByGithubRepoId).mockResolvedValue([intruder, other, baseRepo] as any)
    const res = await POST(req('pull_request', prPayload()))
    expect(res.status).toBe(202)
    expect(startGenerationJob).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', repoId: 'repo-uuid-1' }))
  })

  it('rejects oversized bodies before reading them', async () => {
    const res = await POST(
      new Request('http://localhost/api/webhooks/github', {
        method: 'POST',
        headers: { 'x-github-event': 'push', 'content-length': '3000000' },
        body: '{}',
      }),
    )
    expect(res.status).toBe(413)
    expect(listReposByGithubRepoId).not.toHaveBeenCalled()
  })

  it('ignores ship moments on repos beyond the plan limit', async () => {
    vi.mocked(isRepoWithinPlan).mockResolvedValueOnce(false)
    const res = await POST(req('pull_request', prPayload()))
    expect((await res.json()).ignored).toBe('plan_repo_limit')
    expect(startGenerationJob).not.toHaveBeenCalled()
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 })
    expect((await POST(req('push', pushPayload()))).status).toBe(429)
  })
})

describe('push events', () => {
  it('ignores pushes to non-default branches', async () => {
    const res = await POST(req('push', pushPayload('refs/heads/feature-x')))
    expect((await res.json()).ignored).toBe('non_default_branch')
    expect(startGenerationJob).not.toHaveBeenCalled()
  })

  it('ignores when autoGenerate is disabled', async () => {
    vi.mocked(listReposByGithubRepoId).mockResolvedValue([{ ...baseRepo, autoGenerate: false }] as any)
    const res = await POST(req('push', pushPayload()))
    expect((await res.json()).ignored).toBe('auto_generate_disabled')
  })

  it('drafts at most once a day per repo', async () => {
    vi.mocked(insertShipEvent).mockResolvedValue(null)
    const res = await POST(req('push', pushPayload()))
    expect((await res.json()).ignored).toBe('already_drafted_today')
    expect(startGenerationJob).not.toHaveBeenCalled()
  })

  it('ignores when a job is already active', async () => {
    vi.mocked(getActiveJob).mockResolvedValue({ id: 'running' })
    const res = await POST(req('push', pushPayload()))
    expect((await res.json()).ignored).toBe('active_job')
    expect(updateShipEvent).toHaveBeenCalledWith('ship-1', { metadata: { skipped: 'active_job' } })
  })

  it('starts a push job that is not auto-queued unless push_window is on', async () => {
    const res = await POST(req('push', pushPayload()))
    expect(res.status).toBe(202)
    expect(startGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'push', autoQueue: false, source: expect.objectContaining({ type: 'window' }) }),
    )
    expect(updateShipEvent).toHaveBeenCalledWith('ship-1', { jobId: 'job-1' })
  })

  it('auto-queues pushes when the push_window trigger is on', async () => {
    vi.mocked(getAutopilotSettings).mockResolvedValue({ ...settings, triggers: ['push_window'] } as any)
    await POST(req('push', pushPayload()))
    expect(startGenerationJob).toHaveBeenCalledWith(expect.objectContaining({ autoQueue: true }))
  })

  it('returns 412 when the owner has no GitHub token', async () => {
    vi.mocked(startGenerationJob).mockResolvedValue({ ok: false, status: 412, code: 'no_github_token', error: 'x' })
    const res = await POST(req('push', pushPayload()))
    expect(res.status).toBe(412)
  })
})

describe('pull_request events (ship moments)', () => {
  it('starts an auto-queued job for a merged PR', async () => {
    const res = await POST(req('pull_request', prPayload()))
    expect(res.status).toBe(202)
    expect(insertShipEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pr_merged', externalId: '42', title: 'Retry failed webhook deliveries with backoff' }),
    )
    expect(startGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'pr_merged',
        autoQueue: true,
        source: { type: 'pr', ref: 'https://github.com/acme/widget/pull/42' },
      }),
    )
  })

  it.each([
    ['closed but not merged', prPayload({ merged: false }), 'not_merged'],
    ['opened', prPayload({}, 'opened'), 'not_merged'],
    ['bot author', prPayload({ user: { login: 'dependabot[bot]' } }), 'bot_author'],
    ['chore title', prPayload({ title: 'chore(deps): bump zod' }), 'chore_title'],
    ['skip label', prPayload({ labels: [{ name: 'no-post' }] }), 'skip_label'],
    ['tiny change', prPayload({ additions: 5, deletions: 2 }), 'too_small'],
    ['other base branch', prPayload({ base: { ref: 'develop' } }), 'non_default_branch'],
  ])('ignores %s', async (_label, body, reason) => {
    const res = await POST(req('pull_request', body))
    expect((await res.json()).ignored).toBe(reason)
    expect(startGenerationJob).not.toHaveBeenCalled()
  })

  it('ignores when autopilot is off, the trigger is off, or the repo is excluded', async () => {
    vi.mocked(getAutopilotSettings).mockResolvedValueOnce({ ...settings, enabled: false } as any)
    expect((await (await POST(req('pull_request', prPayload()))).json()).ignored).toBe('autopilot_off')

    vi.mocked(getAutopilotSettings).mockResolvedValueOnce({ ...settings, triggers: ['weekly_digest'] } as any)
    expect((await (await POST(req('pull_request', prPayload()))).json()).ignored).toBe('trigger_off')

    vi.mocked(listReposByGithubRepoId).mockResolvedValueOnce([{ ...baseRepo, autopilotEnabled: false }] as any)
    expect((await (await POST(req('pull_request', prPayload()))).json()).ignored).toBe('repo_autopilot_off')

    const future = new Date(Date.now() + 3600_000).toISOString()
    vi.mocked(getAutopilotSettings).mockResolvedValueOnce({ ...settings, pausedUntil: future } as any)
    expect((await (await POST(req('pull_request', prPayload()))).json()).ignored).toBe('autopilot_paused')
  })

  it('ignores when the plan lacks ship moments', async () => {
    vi.mocked(hasFeature).mockResolvedValue(false)
    const res = await POST(req('pull_request', prPayload()))
    expect((await res.json()).ignored).toBe('plan')
    expect(insertShipEvent).not.toHaveBeenCalled()
  })

  it('dedupes repeat deliveries', async () => {
    vi.mocked(insertShipEvent).mockResolvedValue(null)
    const res = await POST(req('pull_request', prPayload()))
    expect((await res.json()).ignored).toBe('duplicate')
  })

  it('keeps the ship event and emails once when over the monthly limit', async () => {
    const planError = {
      error: 'limit', code: 'limit_reached' as const, limit: 'generationsPerMonth' as const,
      used: 10, max: 10, requiredPlan: 'pro' as const, currentPlan: 'free' as const,
    }
    vi.mocked(startGenerationJob).mockResolvedValue({ ok: false, status: 402, code: 'limit_reached', error: 'limit', planError })
    const res = await POST(req('pull_request', prPayload()))
    expect(res.status).toBe(200)
    expect((await res.json()).ignored).toBe('limit_reached')
    expect(updateShipEvent).toHaveBeenCalledWith('ship-1', { metadata: { skipped: 'limit_reached' } })
    expect(sendLimitReachedOnce).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', used: 10, max: 10 }))
  })
})

describe('release events', () => {
  it('starts a release job keyed by release id', async () => {
    const res = await POST(req('release', releasePayload()))
    expect(res.status).toBe(202)
    expect(insertShipEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'release_published', externalId: '777', title: 'Widget 2.0' }),
    )
    expect(startGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'release_published', source: { type: 'release', ref: 'v2.0.0' } }),
    )
  })

  it('ignores prereleases, drafts and non-published actions', async () => {
    expect((await (await POST(req('release', releasePayload({ prerelease: true })))).json()).ignored).toBe('prerelease')
    expect((await (await POST(req('release', releasePayload({ draft: true })))).json()).ignored).toBe('draft')
    expect((await (await POST(req('release', releasePayload({}, 'created')))).json()).ignored).toBe('not_published')
    expect(startGenerationJob).not.toHaveBeenCalled()
  })
})
