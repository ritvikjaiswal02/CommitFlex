/**
 * The publish cron (GET /api/cron/publish). Claims due items one at a time
 * with a conditional update, so overlapping runs never publish twice.
 */
import { listDueQueueItems, transitionQueueItem } from '@/lib/db/queries/autopilot'
import { sendReadyToPost, type EmailPost } from '@/lib/autopilot/emails'
import type { QueueStatus } from '@/types/autopilot'
import { hasOpenPublishIntent } from '@/lib/db/queries/publish'
import { MAX_PUBLISH_ATTEMPTS, RETRY_DELAY_MS, publishQueueItem } from './publisher'

/** Shown on an item we refuse to re-send because the first attempt may have gone out. */
export const MAYBE_POSTED_ERROR = 'We may have posted this already; check LinkedIn'

export interface PublishCronResult {
  ok: true
  published: number
  ready: number
  retried: number
  failed: number
  durationMs: number
}

export async function runPublishCron(opts: { now?: Date; budgetMs?: number; limit?: number } = {}): Promise<PublishCronResult> {
  const started = Date.now()
  const now = opts.now ?? new Date()
  const deadline = started + (opts.budgetMs ?? 50_000)
  const counts = { published: 0, ready: 0, retried: 0, failed: 0 }
  const readyByUser = new Map<string, (EmailPost & { reason?: string | null })[]>()

  const due = await listDueQueueItems(now, opts.limit ?? 50)
  for (const row of due) {
    if (Date.now() > deadline) break
    // A worker died mid-publish. If it got as far as calling LinkedIn, the
    // post may be live: never send it again automatically.
    if (row.status === 'publishing' && (await hasOpenPublishIntent(row.id))) {
      const parked = await transitionQueueItem(row.id, ['publishing'], {
        status: 'failed',
        nextAttemptAt: null,
        lastError: MAYBE_POSTED_ERROR,
      })
      if (parked) counts.failed++
      continue
    }
    const claimed = await transitionQueueItem(row.id, [row.status as QueueStatus], { status: 'publishing' })
    if (!claimed) continue
    try {
      const outcome = await publishQueueItem(claimed, { notify: true, now, claimed: true })
      if (outcome.status === 'published') counts.published++
      else if (outcome.status === 'retry') counts.retried++
      else if (outcome.status === 'failed') counts.failed++
      else {
        counts.ready++
        const list = readyByUser.get(row.userId) ?? []
        list.push({
          queueItemId: row.id,
          draftId: row.draftId,
          platform: row.platform === 'twitter' ? 'twitter' : 'linkedin',
          content: outcome.content,
          hashtags: outcome.hashtags,
          scheduledFor: row.scheduledFor,
          reason: outcome.reason,
        })
        readyByUser.set(row.userId, list)
      }
    } catch (err) {
      console.error('[publish] item failed', row.id, err)
      const attempts = claimed.attempts + 1
      const lastError = err instanceof Error ? err.message : String(err)
      const giveUp = attempts >= MAX_PUBLISH_ATTEMPTS
      if (giveUp) counts.failed++
      else counts.retried++
      await transitionQueueItem(
        row.id,
        ['publishing'],
        giveUp
          ? { status: 'failed', attempts, nextAttemptAt: null, lastError }
          : { status: 'scheduled', attempts, nextAttemptAt: new Date(now.getTime() + RETRY_DELAY_MS), lastError },
      ).catch(() => null)
    }
  }

  // One "ready to post" email per user per run, however many items.
  for (const [userId, posts] of Array.from(readyByUser.entries())) {
    await sendReadyToPost({ userId, posts })
  }

  return { ok: true, ...counts, durationMs: Date.now() - started }
}
