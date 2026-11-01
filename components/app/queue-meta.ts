import type { JobTrigger, PublishMethod, QueueItemView, QueueStatus } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import type { NodeState } from '@/components/ui/status-node'
import { capitalize, formatWhen } from '@/components/app/format'

/** Client-safe labels and helpers for queue items. */

export const QUEUE_STATUSES: readonly QueueStatus[] = [
  'pending_review',
  'approved',
  'scheduled',
  'ready',
  'publishing',
  'published',
  'failed',
  'skipped',
] as const

/** Statuses that still need something to happen. */
export const OPEN_STATUSES: readonly QueueStatus[] = ['pending_review', 'approved', 'scheduled', 'ready', 'publishing']

export type QueueTabKey = 'review' | 'scheduled' | 'ready' | 'published' | 'closed'

export const QUEUE_TABS: readonly {
  key: QueueTabKey
  label: string
  /** Label below `sm` (375px phones fit all tabs). */
  shortLabel: string
  statuses: readonly QueueStatus[]
}[] = [
  { key: 'review', label: 'Needs review', shortLabel: 'Review', statuses: ['pending_review'] },
  { key: 'scheduled', label: 'Scheduled', shortLabel: 'Scheduled', statuses: ['approved', 'scheduled', 'publishing'] },
  { key: 'ready', label: 'Ready to post', shortLabel: 'Ready', statuses: ['ready'] },
  { key: 'published', label: 'Published', shortLabel: 'Published', statuses: ['published'] },
  { key: 'closed', label: 'Failed and skipped', shortLabel: 'Closed', statuses: ['failed', 'skipped'] },
]

/** Drafts that were never queued: a tab of their own, not a queue state. */
export const UNQUEUED_TAB = { key: 'unqueued', label: 'Unqueued', shortLabel: 'Unqueued' } as const

export function isQueueTabKey(value: unknown): value is QueueTabKey {
  return typeof value === 'string' && QUEUE_TABS.some((t) => t.key === value)
}

export function tabForStatus(status: QueueStatus): QueueTabKey {
  return QUEUE_TABS.find((t) => t.statuses.includes(status))?.key ?? 'review'
}

export const TRIGGER_LABELS: Record<JobTrigger, string> = {
  manual: 'Manual draft',
  push: 'Push',
  pr_merged: 'Merged PR',
  release_published: 'Release',
  weekly_digest: 'Weekly digest',
  cadence: 'Cadence',
  extension: 'Chrome extension',
  onboarding: 'First run',
}

export const METHOD_LABELS: Record<PublishMethod, string> = {
  linkedin_api: 'Published through LinkedIn',
  x_intent: 'Posted on X',
  extension: 'Posted with the extension',
  manual: 'Marked as posted',
}

export function triggerLabel(trigger: string | null | undefined): string {
  if (!trigger) return TRIGGER_LABELS.manual
  return (TRIGGER_LABELS as Record<string, string>)[trigger] ?? capitalize(trigger.replace(/_/g, ' '))
}

/** StatusNode state for a queue status; a draft with no queue item is 'draft'. */
export function nodeStateFor(status: QueueStatus | null | undefined): NodeState {
  return status ?? 'draft'
}

/** scheduled_for ascending (nulls last), then newest first: the order listQueue returns. */
export function sortQueue<T extends Pick<QueueItemView, 'scheduledFor' | 'createdAt'>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.scheduledFor && b.scheduledFor) {
      const diff = new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
      if (diff !== 0) return diff
    } else if (a.scheduledFor) {
      return -1
    } else if (b.scheduledFor) {
      return 1
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/** Newest activity first, for the published and closed lists. */
export function sortByRecent<T extends Pick<QueueItemView, 'publishedAt' | 'updatedAt'>>(items: readonly T[]): T[] {
  const at = (item: T) => new Date(item.publishedAt ?? item.updatedAt).getTime()
  return [...items].sort((a, b) => at(b) - at(a))
}

/** The one-line "when" for a queue row. */
export function describeWhen(
  item: Pick<QueueItemView, 'status' | 'scheduledFor' | 'publishedAt' | 'updatedAt' | 'createdAt'>,
  tz: string,
  now: Date = new Date(),
): string {
  switch (item.status) {
    case 'pending_review':
      return item.scheduledFor ? `Slot ${formatWhen(item.scheduledFor, tz, now)}` : 'No slot yet'
    case 'approved':
      return item.scheduledFor ? `Approved for ${formatWhen(item.scheduledFor, tz, now)}` : 'Approved, not scheduled'
    case 'scheduled':
      return item.scheduledFor ? `Goes out ${formatWhen(item.scheduledFor, tz, now)}` : 'Scheduled'
    case 'ready':
      return `Ready since ${formatWhen(item.updatedAt, tz, now)}`
    case 'publishing':
      return 'Publishing now'
    case 'published':
      return `Published ${formatWhen(item.publishedAt ?? item.updatedAt, tz, now)}`
    case 'failed':
      return `Failed ${formatWhen(item.updatedAt, tz, now)}`
    case 'skipped':
      return `Skipped ${formatWhen(item.updatedAt, tz, now)}`
    default:
      return `Drafted ${formatWhen(item.createdAt, tz, now)}`
  }
}

/** Label of the publish action for a platform. */
export function publishLabel(platform: PostPlatform, linkedinDirect: boolean): string {
  if (platform === 'twitter') return 'Post on X'
  return linkedinDirect ? 'Publish now' : 'Post on LinkedIn'
}

export function countByStatus(items: readonly Pick<QueueItemView, 'status'>[]): Record<QueueStatus, number> {
  const counts = Object.fromEntries(QUEUE_STATUSES.map((s) => [s, 0])) as Record<QueueStatus, number>
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1
  return counts
}

export function countByTab(items: readonly Pick<QueueItemView, 'status'>[]): Record<QueueTabKey, number> {
  const byStatus = countByStatus(items)
  const result = {} as Record<QueueTabKey, number>
  for (const tab of QUEUE_TABS) result[tab.key] = tab.statuses.reduce((sum, s) => sum + byStatus[s], 0)
  return result
}
