import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/plans', () => ({ hasFeature: vi.fn(), planErrorToResponse: () => null }))
vi.mock('@/lib/db/queries/drafts', () => ({ getDraftWithContext: vi.fn(), setDraftStatus: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({
  updateQueueItem: vi.fn(async (id: string, patch: any) => ({ id, ...patch })),
  listDueQueueItems: vi.fn(),
  transitionQueueItem: vi.fn(),
}))
vi.mock('@/lib/db/queries/integrations', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries/integrations')>('@/lib/db/queries/integrations')
  return { connectionStatus: actual.connectionStatus, getLinkedInConnection: vi.fn(), setLinkedInStatus: vi.fn() }
})
vi.mock('@/lib/db/queries/publish', () => ({
  insertPublishLog: vi.fn(async () => 'intent-1'),
  resolvePublishIntent: vi.fn(),
  hasOpenPublishIntent: vi.fn(async () => false),
}))
vi.mock('@/lib/auth/encrypt', () => ({ decrypt: vi.fn(() => 'plain-token') }))
vi.mock('@/lib/autopilot/emails', () => ({
  sendLinkedInExpired: vi.fn(),
  sendPublishFailed: vi.fn(),
  sendPublishReceipt: vi.fn(),
  sendReadyToPost: vi.fn(),
}))
vi.mock('@/lib/publish/linkedin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/publish/linkedin')>('@/lib/publish/linkedin')
  return { LinkedInApiError: actual.LinkedInApiError, createLinkedInPost: vi.fn() }
})

import { hasFeature } from '@/lib/plans'
import { getDraftWithContext, setDraftStatus } from '@/lib/db/queries/drafts'
import { listDueQueueItems, transitionQueueItem, updateQueueItem } from '@/lib/db/queries/autopilot'
import { getLinkedInConnection, setLinkedInStatus } from '@/lib/db/queries/integrations'
import { hasOpenPublishIntent, insertPublishLog, resolvePublishIntent } from '@/lib/db/queries/publish'
import { sendLinkedInExpired, sendPublishFailed, sendPublishReceipt, sendReadyToPost } from '@/lib/autopilot/emails'
import { LinkedInApiError, createLinkedInPost } from '@/lib/publish/linkedin'
import { publishQueueItem } from '@/lib/publish/publisher'
import { runPublishCron } from '@/lib/publish/cron'

const ENV = { LINKEDIN_CLIENT_ID: 'id', LINKEDIN_CLIENT_SECRET: 'secret', OAUTH_TOKEN_ENCRYPTION_KEY: 'b'.repeat(64) }
const saved: Record<string, string | undefined> = {}

const now = new Date('2026-11-03T03:30:00Z')
const connection = { userId: 'user-1', providerAccountId: 'member-1', accessTokenEnc: 'enc', status: 'active', expiresAt: new Date('2027-01-01') }

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1', userId: 'user-1', draftId: 'd1', platform: 'linkedin', status: 'publishing',
    scheduledFor: now, attempts: 0, approvedAt: now, approvedBy: 'owner', ...overrides,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  vi.mocked(getDraftWithContext).mockResolvedValue({
    draft: { id: 'd1', deletedAt: null, originalContent: 'We shipped retries.', editedContent: null, platformMetadata: { hashtags: ['#webhooks'] } },
    job: { id: 'job-1' },
    repoFullName: 'acme/widget',
  } as any)
  vi.mocked(hasFeature).mockResolvedValue(true)
  vi.mocked(getLinkedInConnection).mockResolvedValue(connection as any)
  vi.mocked(createLinkedInPost).mockResolvedValue({ urn: 'urn:li:share:1', url: 'https://www.linkedin.com/feed/update/urn:li:share:1/' })
})

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('publishQueueItem', () => {
  it('publishes LinkedIn posts through the API with hashtags appended', async () => {
    const out = await publishQueueItem(item(), { notify: true, now })
    expect(out.status).toBe('published')
    expect(createLinkedInPost).toHaveBeenCalledWith({
      accessToken: 'plain-token',
      authorSub: 'member-1',
      text: 'We shipped retries.\n\n#webhooks',
    })
    expect(updateQueueItem).toHaveBeenLastCalledWith('item-1', expect.objectContaining({
      status: 'published', publishMethod: 'linkedin_api', externalPostId: 'urn:li:share:1',
    }))
    // An intent is written before the API call and settled after it.
    expect(insertPublishLog).toHaveBeenCalledWith(expect.objectContaining({ method: 'linkedin_api', success: null }))
    expect(resolvePublishIntent).toHaveBeenCalledWith('intent-1', expect.objectContaining({ success: true, externalPostId: 'urn:li:share:1' }))
    expect(setDraftStatus).toHaveBeenCalledWith('d1', 'published')
    expect(sendPublishReceipt).toHaveBeenCalled()
  })

  it('claims an unclaimed row before calling LinkedIn, and backs off when someone else has it', async () => {
    vi.mocked(transitionQueueItem).mockResolvedValueOnce(null)
    await expect(publishQueueItem(item({ status: 'scheduled' }), { now })).rejects.toMatchObject({ status: 409 })
    expect(createLinkedInPost).not.toHaveBeenCalled()
  })

  it('hands off X posts as ready with an intent URL', async () => {
    const out = await publishQueueItem(item({ platform: 'twitter' }), { now })
    expect(out.status).toBe('ready')
    expect(out.result.method).toBe('x_intent')
    expect(out.result.intentUrl).toMatch(/^https:\/\/x\.com\/intent\/post\?text=/)
    expect(createLinkedInPost).not.toHaveBeenCalled()
  })

  it('hands off LinkedIn when the plan lacks direct publishing', async () => {
    vi.mocked(hasFeature).mockResolvedValue(false)
    const out = await publishQueueItem(item(), { now })
    expect(out.status).toBe('ready')
    expect(out.reason).toMatch(/Pro/)
    expect(out.result.intentUrl).toMatch(/linkedin\.com\/feed/)
  })

  it('marks the connection expired and falls back to ready on 401', async () => {
    vi.mocked(createLinkedInPost).mockRejectedValue(new LinkedInApiError(401, 'Expired'))
    const out = await publishQueueItem(item(), { notify: true, now })
    expect(out.status).toBe('ready')
    expect(setLinkedInStatus).toHaveBeenCalledWith('user-1', 'expired')
    expect(sendLinkedInExpired).toHaveBeenCalled()
    expect(resolvePublishIntent).toHaveBeenCalledWith('intent-1', expect.objectContaining({ success: false, statusCode: 401 }))
  })

  it('retries other errors in 15 minutes, then fails after 3 attempts', async () => {
    vi.mocked(createLinkedInPost).mockRejectedValue(new LinkedInApiError(500, 'Server error'))
    const retry = await publishQueueItem(item({ attempts: 0 }), { notify: true, now })
    expect(retry.status).toBe('retry')
    expect(updateQueueItem).toHaveBeenLastCalledWith('item-1', expect.objectContaining({
      status: 'scheduled', attempts: 1, nextAttemptAt: new Date(now.getTime() + 15 * 60_000),
    }))

    const failed = await publishQueueItem(item({ attempts: 2 }), { notify: true, now })
    expect(failed.status).toBe('failed')
    expect(sendPublishFailed).toHaveBeenCalled()
  })

  it('surfaces upstream errors as 502 in interactive mode', async () => {
    vi.mocked(createLinkedInPost).mockRejectedValue(new LinkedInApiError(422, 'Duplicate post'))
    await expect(publishQueueItem(item(), { interactive: true, now })).rejects.toMatchObject({ status: 502, code: 'upstream_error' })
    expect(updateQueueItem).toHaveBeenLastCalledWith('item-1', expect.objectContaining({ status: 'ready' }))
  })
})

describe('runPublishCron', () => {
  it('never re-sends a stuck publishing row whose API call may have gone through', async () => {
    vi.mocked(listDueQueueItems).mockResolvedValue([item({ id: 'stuck', status: 'publishing' })])
    vi.mocked(hasOpenPublishIntent).mockResolvedValueOnce(true)
    vi.mocked(transitionQueueItem).mockImplementation(async (id: string, _from: unknown, patch: any) => ({ ...item({ id }), ...patch }))
    const result = await runPublishCron({ now })
    expect(createLinkedInPost).not.toHaveBeenCalled()
    expect(transitionQueueItem).toHaveBeenCalledWith(
      'stuck',
      ['publishing'],
      expect.objectContaining({ status: 'failed', lastError: 'We may have posted this already; check LinkedIn' }),
    )
    expect(result.failed).toBe(1)
  })

  it('claims due items, publishes them and batches one ready email per user', async () => {
    const due = [
      item({ id: 'a', status: 'scheduled' }),
      item({ id: 'b', status: 'scheduled', platform: 'twitter' }),
      item({ id: 'c', status: 'scheduled', platform: 'twitter', draftId: 'd3' }),
    ]
    vi.mocked(listDueQueueItems).mockResolvedValue(due)
    // 'c' was claimed by an overlapping run.
    vi.mocked(transitionQueueItem).mockImplementation(async (id: string) =>
      id === 'c' ? null : { ...due.find((d) => d.id === id), status: 'publishing' },
    )
    const result = await runPublishCron({ now })
    expect(result).toMatchObject({ ok: true, published: 1, ready: 1, retried: 0, failed: 0 })
    expect(sendReadyToPost).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendReadyToPost).mock.calls[0][0].posts).toHaveLength(1)
  })
})
