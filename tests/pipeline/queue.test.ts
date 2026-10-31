import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/plans', () => ({
  assertFeature: vi.fn(),
  assertWithinLimit: vi.fn(),
  getUserPlan: vi.fn(),
  planHasFeature: vi.fn((plan: string, key: string) => plan !== 'free' || key === 'autopilot.weekly_digest'),
  limitFor: vi.fn(() => 5),
  isPlanError: (err: any) => err?.name === 'PlanError',
  planErrorToResponse: (err: any) => (err?.name === 'PlanError' ? Response.json(err.body, { status: 402 }) : null),
}))
vi.mock('@/lib/db/queries/drafts', () => ({
  getDraftWithContext: vi.fn(),
  getDraftsByJob: vi.fn(),
  setDraftStatus: vi.fn(),
}))
vi.mock('@/lib/db/queries/autopilot', () => ({
  getAutopilotSettings: vi.fn(),
  getQueueItemView: vi.fn(async (id: string) => ({ id })),
  getQueueRowByDraft: vi.fn(),
  insertQueueItem: vi.fn(async (values: any) => ({ id: 'new-item', attempts: 0, ...values })),
  listTakenSlots: vi.fn(),
  updateQueueItem: vi.fn(async (id: string, patch: any) => ({ id, ...patch })),
  transitionQueueItem: vi.fn(async (id: string, _from: string[], patch: any) => ({ id, attempts: 0, ...patch })),
  draftHashtags: (m: any) => (Array.isArray(m?.hashtags) ? m.hashtags : []),
  draftContent: (d: any) => d.editedContent ?? d.originalContent,
}))
vi.mock('@/lib/db/queries/jobs', () => ({ getJob: vi.fn() }))
vi.mock('@/lib/db/queries/repos', () => ({ getRepo: vi.fn() }))
vi.mock('@/lib/db/queries/publish', () => ({ insertPublishLog: vi.fn() }))
vi.mock('@/lib/db/queries/events', () => ({ emitEvent: vi.fn() }))
vi.mock('@/lib/publish/publisher', () => ({ publishQueueItem: vi.fn() }))
vi.mock('@/lib/autopilot/emails', () => ({ sendApprovalRequests: vi.fn(), sendScheduledSummary: vi.fn() }))
vi.mock('@/lib/db/queries/notifications', () => ({ getUserContact: vi.fn(async () => null), getUserEmail: vi.fn(async () => null) }))

import { assertWithinLimit, assertFeature, getUserPlan } from '@/lib/plans'
import { getDraftWithContext, getDraftsByJob, setDraftStatus } from '@/lib/db/queries/drafts'
import { getAutopilotSettings, getQueueRowByDraft, insertQueueItem, listTakenSlots, transitionQueueItem, updateQueueItem } from '@/lib/db/queries/autopilot'
import { getJob } from '@/lib/db/queries/jobs'
import { getRepo } from '@/lib/db/queries/repos'
import { insertPublishLog } from '@/lib/db/queries/publish'
import { publishQueueItem } from '@/lib/publish/publisher'
import { sendApprovalRequests, sendScheduledSummary } from '@/lib/autopilot/emails'
import {
  QueueError,
  approveDraft,
  approveQueueRow,
  enqueueJobDrafts,
  publishDraftNow,
  queueErrorToResponse,
  recordManualPublish,
  scheduleDraft,
  skipDraft,
  unscheduleDraft,
} from '@/lib/autopilot/queue'

const settings = {
  enabled: true,
  cadence: 'ship_moments',
  postDays: [],
  postTime: '09:00',
  triggers: ['pr_merged'],
  platforms: ['linkedin', 'twitter'],
  approvalMode: 'review',
  reviewerEmails: ['lead@team.dev'],
  defaultVoiceProfileId: null,
  pausedUntil: null,
  timezone: 'UTC',
}

const ctx = {
  draft: { id: 'd1', userId: 'user-1', platform: 'linkedin', deletedAt: null, originalContent: 'Hi', editedContent: null },
  job: { id: 'job-1', repoId: 'repo-1' },
  repoFullName: 'acme/widget',
  repoId: 'repo-1',
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    userId: 'user-1',
    draftId: 'd1',
    platform: 'linkedin',
    status: 'pending_review',
    scheduledFor: null,
    approvedAt: null,
    approvedBy: null,
    attempts: 0,
    ...overrides,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDraftWithContext).mockResolvedValue(ctx as any)
  vi.mocked(getAutopilotSettings).mockResolvedValue(settings as any)
  vi.mocked(listTakenSlots).mockResolvedValue([])
  vi.mocked(getQueueRowByDraft).mockResolvedValue(null)
  vi.mocked(assertWithinLimit).mockResolvedValue({} as any)
})

describe('ownership', () => {
  it('404s for a missing or deleted draft and 403s for another user', async () => {
    vi.mocked(getDraftWithContext).mockResolvedValueOnce(null as any)
    await expect(approveDraft('user-1', 'd1')).rejects.toMatchObject({ status: 404, code: 'not_found' })
    vi.mocked(getDraftWithContext).mockResolvedValueOnce({ ...ctx, draft: { ...ctx.draft, userId: 'other' } } as any)
    await expect(approveDraft('user-1', 'd1')).rejects.toMatchObject({ status: 403 })
  })

  it('turns QueueError into JSON with its code', async () => {
    const res = queueErrorToResponse(new QueueError(409, 'slot_taken', 'Taken'))!
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Taken', code: 'slot_taken' })
    expect(queueErrorToResponse(new Error('other'))).toBeNull()
  })
})

describe('approve', () => {
  it('creates an approved item for an unqueued draft', async () => {
    await approveDraft('user-1', 'd1')
    expect(assertWithinLimit).toHaveBeenCalledWith('user-1', 'queuedPosts')
    expect(insertQueueItem).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', approvedBy: 'owner', platform: 'linkedin' }))
  })

  it('keeps a future slot and moves a pending item to scheduled', async () => {
    const future = new Date(Date.now() + 86_400_000)
    const { item, changed } = await approveQueueRow(row({ scheduledFor: future }), 'lead@team.dev')
    expect(changed).toBe(true)
    expect(item).toMatchObject({ status: 'scheduled', scheduledFor: future, approvedBy: 'lead@team.dev' })
  })

  it('moves a pending item whose slot passed to the next free slot', async () => {
    const past = new Date(Date.now() - 3600_000)
    const { item } = await approveQueueRow(row({ scheduledFor: past }), 'owner')
    expect(item.status).toBe('scheduled')
    expect((item.scheduledFor as Date).getTime()).toBeGreaterThan(Date.now())
  })

  it('is a no-op for already approved items', async () => {
    const { changed } = await approveQueueRow(row({ status: 'scheduled' }), 'owner')
    expect(changed).toBe(false)
    expect(updateQueueItem).not.toHaveBeenCalled()
  })

  it('refuses to approve a published post', async () => {
    vi.mocked(getQueueRowByDraft).mockResolvedValue(row({ status: 'published' }))
    await expect(approveDraft('user-1', 'd1')).rejects.toMatchObject({ status: 409, code: 'invalid_state' })
  })
})

describe('schedule', () => {
  it('rejects times in the past', async () => {
    await expect(scheduleDraft('user-1', 'd1', new Date(Date.now() - 1000))).rejects.toMatchObject({ status: 400, code: 'in_past' })
  })

  it('rejects a taken slot for the same platform', async () => {
    // Minute-aligned so "+10 seconds" stays inside the same slot minute.
    const at = new Date(Math.floor((Date.now() + 86_400_000) / 60_000) * 60_000)
    vi.mocked(listTakenSlots).mockResolvedValue([new Date(at.getTime() + 10_000)])
    await expect(scheduleDraft('user-1', 'd1', at)).rejects.toMatchObject({ status: 409, code: 'slot_taken' })
  })

  it('schedules into the next free slot and checks the queue limit for new items', async () => {
    await scheduleDraft('user-1', 'd1', 'next_slot')
    expect(assertWithinLimit).toHaveBeenCalledWith('user-1', 'queuedPosts')
    const values = vi.mocked(insertQueueItem).mock.calls[0][0] as any
    expect(values.status).toBe('scheduled')
    expect(values.scheduledFor.getTime()).toBeGreaterThan(Date.now())
  })

  it('does not re-check the limit for an item already counted', async () => {
    vi.mocked(getQueueRowByDraft).mockResolvedValue(row({ status: 'approved', approvedAt: new Date() }))
    await scheduleDraft('user-1', 'd1', new Date(Date.now() + 86_400_000))
    expect(assertWithinLimit).not.toHaveBeenCalled()
    expect(updateQueueItem).toHaveBeenCalledWith('item-1', expect.objectContaining({ status: 'scheduled' }))
  })

  it('unschedules back to approved or needs review', async () => {
    vi.mocked(getQueueRowByDraft).mockResolvedValue(row({ status: 'scheduled', approvedAt: new Date() }))
    await unscheduleDraft('user-1', 'd1')
    expect(updateQueueItem).toHaveBeenCalledWith('item-1', expect.objectContaining({ status: 'approved', scheduledFor: null }))

    vi.mocked(getQueueRowByDraft).mockResolvedValue(row({ status: 'pending_review', approvedAt: null }))
    await unscheduleDraft('user-1', 'd1')
    expect(updateQueueItem).toHaveBeenLastCalledWith('item-1', expect.objectContaining({ status: 'pending_review' }))

    vi.mocked(getQueueRowByDraft).mockResolvedValue(null)
    await expect(unscheduleDraft('user-1', 'd1')).rejects.toMatchObject({ status: 404 })
  })
})

describe('skip, publish, posted', () => {
  it('skips a queued item', async () => {
    vi.mocked(getQueueRowByDraft).mockResolvedValue(row())
    await skipDraft('user-1', 'd1')
    expect(updateQueueItem).toHaveBeenCalledWith('item-1', expect.objectContaining({ status: 'skipped' }))
  })

  it('publishes now through the publisher in interactive mode', async () => {
    vi.mocked(publishQueueItem).mockResolvedValue({
      status: 'ready',
      item: row({ status: 'ready' }),
      result: { method: 'manual', url: null, intentUrl: 'https://www.linkedin.com/feed/?shareActive=true&text=Hi' },
    } as any)
    const { result } = await publishDraftNow('user-1', 'd1')
    // The row is claimed with a conditional update before anything is sent.
    expect(transitionQueueItem).toHaveBeenCalledWith('new-item', expect.arrayContaining(['approved', 'scheduled']), { status: 'publishing' })
    expect(publishQueueItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-item', status: 'publishing' }),
      expect.objectContaining({ interactive: true, claimed: true }),
    )
    expect(result.intentUrl).toMatch(/linkedin\.com/)
  })

  it('refuses to publish twice when another click or the cron claimed the row first', async () => {
    vi.mocked(getQueueRowByDraft).mockResolvedValue(row({ status: 'scheduled' }))
    vi.mocked(transitionQueueItem).mockResolvedValueOnce(null)
    const err = await publishDraftNow('user-1', 'd1').catch((e) => e)
    expect(err).toBeInstanceOf(QueueError)
    expect(err.status).toBe(409)
    expect(publishQueueItem).not.toHaveBeenCalled()
  })

  it('will not mark a post as posted while the cron is publishing it', async () => {
    vi.mocked(getQueueRowByDraft).mockResolvedValue(row({ status: 'publishing' }))
    const err = await recordManualPublish({ userId: 'user-1', draftId: 'd1', method: 'manual' }).catch((e) => e)
    expect(err.status).toBe(409)
    expect(insertPublishLog).not.toHaveBeenCalled()
  })

  it('checks the feature when the LinkedIn API is explicitly requested', async () => {
    const body = { error: 'locked', code: 'feature_locked', feature: 'publish.linkedin_direct', requiredPlan: 'pro', currentPlan: 'free' }
    vi.mocked(assertFeature).mockRejectedValue(Object.assign(new Error('locked'), { name: 'PlanError', status: 402, body }))
    const err = await publishDraftNow('user-1', 'd1', { method: 'linkedin_api' }).catch((e) => e)
    expect(queueErrorToResponse(err)!.status).toBe(402)
    expect(publishQueueItem).not.toHaveBeenCalled()
  })

  it('records a manual publish with a log row and draft status', async () => {
    vi.mocked(getQueueRowByDraft).mockResolvedValue(row({ status: 'ready' }))
    await recordManualPublish({ userId: 'user-1', draftId: 'd1', method: 'x_intent', externalUrl: 'https://x.com/a/status/1' })
    expect(transitionQueueItem).toHaveBeenCalledWith(
      'item-1',
      expect.arrayContaining(['ready']),
      expect.objectContaining({ status: 'published', publishMethod: 'x_intent', externalUrl: 'https://x.com/a/status/1' }),
    )
    expect(insertPublishLog).toHaveBeenCalledWith(expect.objectContaining({ method: 'x_intent', success: true }))
    expect(setDraftStatus).toHaveBeenCalledWith('d1', 'published')
  })
})

describe('enqueueJobDrafts', () => {
  const drafts = [
    { id: 'li-1', platform: 'linkedin', sequenceNumber: 1, originalContent: 'LinkedIn post', editedContent: null, platformMetadata: { hashtags: ['#dev'] } },
    { id: 'x-1', platform: 'twitter', sequenceNumber: 2, originalContent: 'X post', editedContent: null, platformMetadata: {} },
    { id: 'li-2', platform: 'linkedin', sequenceNumber: 3, originalContent: 'Variant', editedContent: null, platformMetadata: {} },
  ]

  beforeEach(() => {
    vi.mocked(getJob).mockResolvedValue({ id: 'job-1', userId: 'user-1', repoId: 'repo-1', trigger: 'pr_merged', sourceType: 'pr', sourceRef: 'https://github.com/acme/widget/pull/9' } as any)
    vi.mocked(getRepo).mockResolvedValue({ fullName: 'acme/widget' } as any)
    vi.mocked(getDraftsByJob).mockResolvedValue(drafts as any)
    let n = 0
    vi.mocked(insertQueueItem).mockImplementation(async (values: any) => ({ id: `item-${++n}`, ...values }))
  })

  it('queues one pending item per platform into free slots and emails approvals', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'team' } as any)
    const result = await enqueueJobDrafts('job-1')
    expect(result).toEqual({ queued: 2, skippedForLimit: 0, mode: 'review' })
    const inserted = vi.mocked(insertQueueItem).mock.calls.map((c) => c[0] as any)
    expect(inserted.map((v) => v.draftId)).toEqual(['li-1', 'x-1'])
    expect(inserted.every((v) => v.status === 'pending_review' && v.scheduledFor instanceof Date)).toBe(true)
    expect(sendApprovalRequests).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerEmails: ['lead@team.dev'], sourceTitle: 'pull request #9' }),
    )
  })

  it('schedules directly in auto mode when the plan allows it', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'pro' } as any)
    vi.mocked(getAutopilotSettings).mockResolvedValue({ ...settings, approvalMode: 'auto' } as any)
    const result = await enqueueJobDrafts('job-1')
    expect(result.mode).toBe('auto')
    expect(vi.mocked(insertQueueItem).mock.calls.every((c) => (c[0] as any).status === 'scheduled')).toBe(true)
    expect(sendScheduledSummary).toHaveBeenCalled()
    expect(sendApprovalRequests).not.toHaveBeenCalled()
  })

  it('falls back to review mode on Free and sends no reviewer emails', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'free' } as any)
    vi.mocked(getAutopilotSettings).mockResolvedValue({ ...settings, approvalMode: 'auto' } as any)
    const result = await enqueueJobDrafts('job-1')
    expect(result.mode).toBe('review')
    expect(sendApprovalRequests).toHaveBeenCalledWith(expect.objectContaining({ reviewerEmails: [] }))
  })

  it('only queues the platforms autopilot posts to', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'pro' } as any)
    vi.mocked(getAutopilotSettings).mockResolvedValue({ ...settings, platforms: ['twitter'] } as any)
    await enqueueJobDrafts('job-1')
    expect(vi.mocked(insertQueueItem).mock.calls.map((c) => (c[0] as any).draftId)).toEqual(['x-1'])
  })

  it('leaves drafts unqueued when the queue limit is reached', async () => {
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'free' } as any)
    vi.mocked(assertWithinLimit).mockRejectedValue(Object.assign(new Error('full'), { name: 'PlanError', status: 402, body: {} }))
    const result = await enqueueJobDrafts('job-1')
    expect(result).toMatchObject({ queued: 0, skippedForLimit: 2 })
    expect(insertQueueItem).not.toHaveBeenCalled()
    expect(sendApprovalRequests).not.toHaveBeenCalled()
  })
})
