/**
 * The `ExtensionItem` shape the Chrome extension renders: one postable piece
 * of text per draft, already composed with its hashtags for the platform,
 * plus the handoff URLs.
 */
import type { PostPlatform } from '@/types/posts'
import type { DraftWithRepo, QueueItemView, QueueStatus } from '@/types/autopilot'
import { buildLinkedInComposeUrl, buildXIntentUrl, composePostText } from '@/lib/publish/intents'

export type ExtensionItemStatus = QueueStatus | 'draft'

export interface ExtensionItem {
  draftId: string
  queueItemId: string | null
  platform: PostPlatform
  status: ExtensionItemStatus
  /** composePostText(content, hashtags, platform) */
  text: string
  repoFullName: string
  scheduledFor: string | null
  createdAt: string
  /** X intent URL or LinkedIn compose URL, pre-filled with `text`. */
  intentUrl: string
  /** `${appUrl()}/jobs/${jobId}` */
  appUrl: string
}

/** The statuses the extension lists as "queue", in display order. */
export const EXTENSION_QUEUE_STATUSES: QueueStatus[] = ['ready', 'scheduled', 'pending_review']

const STATUS_ORDER: Record<string, number> = { ready: 0, scheduled: 1, pending_review: 2 }

export function isPostPlatform(value: unknown): value is PostPlatform {
  return value === 'linkedin' || value === 'twitter'
}

export function intentUrlFor(platform: PostPlatform, text: string): string {
  return platform === 'twitter' ? buildXIntentUrl(text) : buildLinkedInComposeUrl(text)
}

export function jobUrl(base: string, jobId: string): string {
  return `${base}/jobs/${jobId}`
}

function composed(content: string, hashtags: string[] | null | undefined, platform: PostPlatform): string {
  return composePostText(content, Array.isArray(hashtags) ? hashtags : [], platform)
}

export function queueItemToExtensionItem(item: QueueItemView, base: string): ExtensionItem {
  const text = composed(item.content, item.hashtags, item.platform)
  return {
    draftId: item.draftId,
    queueItemId: item.id,
    platform: item.platform,
    status: item.status,
    text,
    repoFullName: item.repoFullName,
    scheduledFor: item.scheduledFor,
    createdAt: item.createdAt,
    intentUrl: intentUrlFor(item.platform, text),
    appUrl: jobUrl(base, item.jobId),
  }
}

export function draftToExtensionItem(draft: DraftWithRepo, base: string): ExtensionItem {
  const text = composed(draft.content, draft.hashtags, draft.platform)
  return {
    draftId: draft.id,
    queueItemId: null,
    platform: draft.platform,
    status: draft.queueStatus ?? 'draft',
    text,
    repoFullName: draft.repoFullName,
    scheduledFor: null,
    createdAt: draft.createdAt,
    intentUrl: intentUrlFor(draft.platform, text),
    appUrl: jobUrl(base, draft.jobId),
  }
}

/** A raw post_drafts row (as returned by getDraftsByJob) for the job progress view. */
export interface DraftRowLike {
  id: string
  jobId: string
  platform: string
  originalContent: string
  editedContent: string | null
  platformMetadata: Record<string, unknown> | null
  createdAt: Date | string
}

export function hashtagsFromMetadata(meta: Record<string, unknown> | null | undefined): string[] {
  const raw = meta?.hashtags
  return Array.isArray(raw) ? raw.filter((h): h is string => typeof h === 'string') : []
}

export function draftRowToExtensionItem(
  row: DraftRowLike,
  ctx: { base: string; repoFullName: string; queue: QueueItemView | null },
): ExtensionItem | null {
  if (!isPostPlatform(row.platform)) return null
  const content = row.editedContent ?? row.originalContent
  const text = composed(content, hashtagsFromMetadata(row.platformMetadata), row.platform)
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
  return {
    draftId: row.id,
    queueItemId: ctx.queue?.id ?? null,
    platform: row.platform,
    status: ctx.queue?.status ?? 'draft',
    text,
    repoFullName: ctx.repoFullName,
    scheduledFor: ctx.queue?.scheduledFor ?? null,
    createdAt,
    intentUrl: intentUrlFor(row.platform, text),
    appUrl: jobUrl(ctx.base, row.jobId),
  }
}

/**
 * Orders queue items for the extension: ready first, then scheduled by time
 * (soonest first), then items waiting for review (soonest slot first).
 */
export function sortQueueForExtension<T extends { status: string; scheduledFor: string | null; createdAt: string }>(
  items: T[],
): T[] {
  const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY)
  return [...items].sort((a, b) => {
    const byStatus = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    if (byStatus !== 0) return byStatus
    const bySlot = time(a.scheduledFor) - time(b.scheduledFor)
    if (bySlot !== 0 && Number.isFinite(bySlot)) return bySlot
    if (a.scheduledFor && !b.scheduledFor) return -1
    if (!a.scheduledFor && b.scheduledFor) return 1
    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
}
