import type { QueueItemView } from '@/types/autopilot'

/** A queue item with sensible defaults for component tests. */
export function makeItem(overrides: Partial<QueueItemView> = {}): QueueItemView {
  const id = overrides.id ?? 'item-1'
  return {
    id,
    draftId: overrides.draftId ?? `draft-${id}`,
    jobId: 'job-1',
    repoId: 'repo-1',
    repoFullName: 'ritvik/commitflex',
    platform: 'linkedin',
    status: 'pending_review',
    content: 'Shipped retries for the GitHub webhook so merged PRs never get lost.',
    hashtags: ['#buildinpublic'],
    scheduledFor: '2026-11-05T03:30:00.000Z',
    approvedAt: null,
    publishedAt: null,
    publishMethod: null,
    externalUrl: null,
    lastError: null,
    trigger: 'pr_merged',
    sourceTitle: 'fix: race in webhook retry',
    createdAt: '2026-11-03T03:00:00.000Z',
    updatedAt: '2026-11-03T03:00:00.000Z',
    ...overrides,
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return jsonResponse(body, status)
    },
  } as unknown as Response
}
