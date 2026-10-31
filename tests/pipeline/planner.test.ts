import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/plans', () => ({ getUserPlan: vi.fn(), planHasFeature: vi.fn(() => true) }))
vi.mock('@/lib/billing/sync', () => ({ enforcePlanLimits: vi.fn() }))
vi.mock('@/lib/db/queries/autopilot', () => ({
  listEnabledAutopilotUsers: vi.fn(),
  listOverdueReviewItems: vi.fn(async () => []),
  listTakenSlots: vi.fn(async () => []),
  listTrialsEndingBetween: vi.fn(async () => []),
  touchAutopilotRun: vi.fn(),
  updateQueueItem: vi.fn(),
  getAutopilotSettings: vi.fn(),
  draftContent: () => '',
  draftHashtags: () => [],
}))
vi.mock('@/lib/db/queries/repos', () => ({ listAutopilotRepos: vi.fn() }))
vi.mock('@/lib/db/queries/jobs', () => ({ hasActiveJobForUser: vi.fn(async () => false), listReposWithJobsSince: vi.fn(async () => new Set()) }))
vi.mock('@/lib/db/queries/integrations', () => ({
  getGithubAccessToken: vi.fn(async () => 'gho'),
  expireStaleLinkedInConnections: vi.fn(async () => 0),
  listExpiringLinkedInConnections: vi.fn(async () => []),
}))
vi.mock('@/lib/db/queries/drafts', () => ({ getDraftWithContext: vi.fn() }))
vi.mock('@/lib/db/queries/notifications', () => ({ hasEmailedUserSince: vi.fn(async () => false) }))
vi.mock('@/lib/db/queries/publish', () => ({ getPublishStats: vi.fn() }))
vi.mock('@/lib/github/activity', () => ({ getRepoActivity: vi.fn() }))
vi.mock('@/lib/pipeline/start', () => ({ startGenerationJob: vi.fn(async () => ({ ok: true, jobId: 'job-x' })) }))
vi.mock('@/lib/autopilot/queue', () => ({ findNextSlot: vi.fn() }))
vi.mock('@/lib/autopilot/limits', () => ({
  // Every autopilot repo is within the plan unless a test says otherwise.
  allowedAutopilotRepoIds: vi.fn(async () => ({ has: () => true })),
}))
vi.mock('@/lib/db/queries/billing', () => ({ listSubscriptionUsersEndedBetween: vi.fn(async () => []) }))
vi.mock('@/lib/autopilot/emails', () => ({
  sendApprovalRequests: vi.fn(),
  sendLinkedInExpiring: vi.fn(),
  sendTrialNotice: vi.fn(),
}))

import { getUserPlan } from '@/lib/plans'
import { enforcePlanLimits } from '@/lib/billing/sync'
import { listEnabledAutopilotUsers, listTakenSlots, listTrialsEndingBetween, touchAutopilotRun } from '@/lib/db/queries/autopilot'
import { listAutopilotRepos } from '@/lib/db/queries/repos'
import { getRepoActivity } from '@/lib/github/activity'
import { startGenerationJob } from '@/lib/pipeline/start'
import { sendTrialNotice } from '@/lib/autopilot/emails'
import { isDigestDue, runAutopilotCron } from '@/lib/autopilot/planner'

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
  timezone: 'Asia/Kolkata',
}

// Monday 2 Nov 2026, 07:00 IST.
const mondayMorning = new Date('2026-11-02T01:30:00Z')

function user(overrides: Record<string, unknown> = {}) {
  return { userId: 'user-1', email: 'dev@example.com', name: 'Dev', settings, lastDigestAt: null, lastPlannedAt: null, ...overrides } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getUserPlan).mockResolvedValue({ id: 'pro', status: 'trialing' } as any)
})

describe('isDigestDue', () => {
  it('is due on Monday after 06:00 local when no digest ran this week', () => {
    expect(isDigestDue(user(), mondayMorning)).toBe(true)
  })

  it('is not due before 06:00 local, or once this week\'s digest ran', () => {
    const lastWeek = new Date('2026-10-26T01:00:00Z') // Mon 26 Oct, 06:30 IST
    expect(isDigestDue(user({ lastDigestAt: lastWeek }), new Date('2026-11-01T23:00:00Z'))).toBe(false) // Mon 04:30 IST
    expect(isDigestDue(user({ lastDigestAt: new Date('2026-11-02T00:45:00Z') }), mondayMorning)).toBe(false)
    expect(isDigestDue(user({ lastDigestAt: new Date('2026-11-02T01:45:00Z') }), new Date('2026-11-03T05:00:00Z'))).toBe(false) // Tuesday
  })

  it('catches up on a Monday no cron run covered, whatever time the cron runs', () => {
    const lastWeek = new Date('2026-10-26T01:00:00Z')
    // Tuesday: Monday's run never happened (or ran before 06:00 local).
    expect(isDigestDue(user({ lastDigestAt: lastWeek }), new Date('2026-11-03T05:00:00Z'))).toBe(true)
    // London (UTC+0): a daily 03:00 UTC cron used to land before 06:00 every Monday.
    const london = user({ settings: { ...settings, timezone: 'Europe/London' }, lastDigestAt: new Date('2026-10-26T08:00:00Z') })
    expect(isDigestDue(london, new Date('2026-11-02T03:00:00Z'))).toBe(false)
    expect(isDigestDue(london, new Date('2026-11-02T07:00:00Z'))).toBe(true)
    expect(isDigestDue(london, new Date('2026-11-03T03:00:00Z'))).toBe(true)
  })

  it('respects the weekly_digest trigger', () => {
    expect(isDigestDue(user({ settings: { ...settings, triggers: ['pr_merged'] } }), mondayMorning)).toBe(false)
  })
})

describe('runAutopilotCron', () => {
  it('starts digest jobs only for repos with at least 3 meaningful commits, top 3', async () => {
    vi.mocked(listEnabledAutopilotUsers).mockResolvedValue([user()])
    vi.mocked(listAutopilotRepos).mockResolvedValue([
      { id: 'r1', fullName: 'a/one' }, { id: 'r2', fullName: 'a/two' }, { id: 'r3', fullName: 'a/three' },
      { id: 'r4', fullName: 'a/four' }, { id: 'r5', fullName: 'a/five' },
    ] as any)
    const counts: Record<string, number> = { 'a/one': 2, 'a/two': 9, 'a/three': 3, 'a/four': 5, 'a/five': 4 }
    vi.mocked(getRepoActivity).mockImplementation(async ({ fullName }) => ({ meaningful: counts[fullName], latestAt: new Date() }))

    const result = await runAutopilotCron({ now: mondayMorning })
    expect(result.digests).toBe(3)
    expect(touchAutopilotRun).toHaveBeenCalledWith('user-1', { lastDigestAt: mondayMorning })
    const repoIds = vi.mocked(startGenerationJob).mock.calls.map((c) => c[0].repoId)
    expect(repoIds).toEqual(['r2', 'r4', 'r5'])
    expect(vi.mocked(startGenerationJob).mock.calls[0][0]).toMatchObject({ trigger: 'weekly_digest', autoQueue: true })
  })

  it('fills an empty cadence slot from the most recently active repo', async () => {
    // Tuesday 3 Nov 2026 00:00 IST; slots Tue 09:00 and Thu 09:00 are within 48h.
    const now = new Date('2026-11-02T18:30:00Z')
    vi.mocked(listEnabledAutopilotUsers).mockResolvedValue([
      user({ settings: { ...settings, cadence: 'twice_weekly', triggers: ['pr_merged'] } }),
    ])
    vi.mocked(listTakenSlots).mockResolvedValue([])
    vi.mocked(listAutopilotRepos).mockResolvedValue([{ id: 'r1', fullName: 'a/one' }, { id: 'r2', fullName: 'a/two' }] as any)
    vi.mocked(getRepoActivity).mockImplementation(async ({ fullName }) =>
      fullName === 'a/two'
        ? { meaningful: 2, latestAt: new Date('2026-11-02T10:00:00Z') }
        : { meaningful: 1, latestAt: new Date('2026-10-30T10:00:00Z') },
    )
    const result = await runAutopilotCron({ now })
    expect(result.cadenceJobs).toBe(1)
    expect(startGenerationJob).toHaveBeenCalledWith(expect.objectContaining({ repoId: 'r2', trigger: 'cadence' }))
  })

  it('never invents content when no repo has meaningful commits', async () => {
    const now = new Date('2026-11-02T18:30:00Z')
    vi.mocked(listEnabledAutopilotUsers).mockResolvedValue([
      user({ settings: { ...settings, cadence: 'twice_weekly', triggers: [] } }),
    ])
    vi.mocked(listAutopilotRepos).mockResolvedValue([{ id: 'r1', fullName: 'a/one' }] as any)
    vi.mocked(getRepoActivity).mockResolvedValue({ meaningful: 0, latestAt: null })
    const result = await runAutopilotCron({ now })
    expect(result.cadenceJobs).toBe(0)
    expect(startGenerationJob).not.toHaveBeenCalled()
  })

  it('downgrades and emails once when a trial has ended', async () => {
    vi.mocked(listEnabledAutopilotUsers).mockResolvedValue([])
    vi.mocked(listTrialsEndingBetween).mockImplementation(async (from: Date) =>
      from.getTime() < mondayMorning.getTime() ? [{ userId: 'user-2', trialEndsAt: new Date('2026-11-01T00:00:00Z') }] : [],
    )
    vi.mocked(getUserPlan).mockResolvedValue({ id: 'free', status: 'free' } as any)
    const result = await runAutopilotCron({ now: mondayMorning })
    expect(enforcePlanLimits).toHaveBeenCalledWith('user-2')
    expect(sendTrialNotice).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-2', kind: 'trial_ended' }))
    expect(result.trialEmails).toBe(0) // sendTrialNotice is mocked to resolve undefined
  })
})
