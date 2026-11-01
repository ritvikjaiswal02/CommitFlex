/**
 * Publishes one queue item.
 *
 * LinkedIn with an active connection and the `publish.linkedin_direct`
 * feature goes through the Posts API. Everything else (X, or LinkedIn
 * without a connection or plan) becomes `ready`: the user gets a pre-filled
 * composer link and the extension shows it.
 */
import { decrypt } from '@/lib/auth/encrypt'
import { isConfigured } from '@/lib/env'
import { hasFeature } from '@/lib/plans'
import { getDraftWithContext, setDraftStatus } from '@/lib/db/queries/drafts'
import { transitionQueueItem, updateQueueItem } from '@/lib/db/queries/autopilot'
import { connectionStatus, getLinkedInConnection, setLinkedInStatus } from '@/lib/db/queries/integrations'
import { insertPublishLog, resolvePublishIntent } from '@/lib/db/queries/publish'
import type { QueueItemRow } from '@/lib/db/schema'
import type { PublishResult, QueueStatus } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { QueueError } from '@/lib/autopilot/errors'
import { sendLinkedInExpired, sendPublishFailed, sendPublishReceipt } from '@/lib/autopilot/emails'
import { buildIntentUrl, composePostText } from './intents'
import { LinkedInApiError, createLinkedInPost } from './linkedin'

export const MAX_PUBLISH_ATTEMPTS = 3
export const RETRY_DELAY_MS = 15 * 60_000

export type PublishStatusOutcome = 'published' | 'ready' | 'retry' | 'failed'

export interface PublishOutcome {
  status: PublishStatusOutcome
  item: QueueItemRow
  result: PublishResult
  /** Composed text, for hand-off emails. */
  text: string
  content: string
  hashtags: string[]
  /** Why the item became ready instead of being published, if relevant. */
  reason: string | null
}

export interface PublishOptions {
  /** Called from a user action: errors surface as QueueError instead of retries. */
  interactive?: boolean
  /** Send receipts and failure emails. */
  notify?: boolean
  /** Skip the API even when available (explicit hand-off). */
  forceHandoff?: boolean
  /**
   * The caller already moved the row to 'publishing' with a conditional
   * update (the cron, publishDraftNow). Otherwise the publisher claims it.
   */
  claimed?: boolean
  now?: Date
}

function handoffMethod(platform: PostPlatform): PublishResult['method'] {
  return platform === 'twitter' ? 'x_intent' : 'manual'
}

async function linkedInDirectAvailable(userId: string) {
  if (!isConfigured('linkedin')) return { ok: false as const, reason: 'LinkedIn publishing is not set up on this server.' }
  if (!(await hasFeature(userId, 'publish.linkedin_direct'))) {
    return { ok: false as const, reason: 'Direct LinkedIn publishing is on Pro.' }
  }
  const connection = await getLinkedInConnection(userId)
  if (!connection) return { ok: false as const, reason: 'LinkedIn is not connected.' }
  const status = connectionStatus(connection)
  if (status !== 'active') {
    if (status === 'expired' && connection.status === 'active') await setLinkedInStatus(userId, 'expired')
    return { ok: false as const, reason: 'Your LinkedIn connection expired.', expired: status === 'expired' }
  }
  return { ok: true as const, connection }
}

export async function publishQueueItem(row: QueueItemRow, opts: PublishOptions = {}): Promise<PublishOutcome> {
  const now = opts.now ?? new Date()
  const ctx = await getDraftWithContext(row.draftId)
  if (!ctx || ctx.draft.deletedAt) {
    const item = await updateQueueItem(row.id, { status: 'skipped', lastError: 'The draft was deleted.' })
    return {
      status: 'failed',
      item,
      result: { method: 'manual', url: null, intentUrl: null },
      text: '',
      content: '',
      hashtags: [],
      reason: 'The draft was deleted.',
    }
  }

  const platform: PostPlatform = row.platform === 'twitter' ? 'twitter' : 'linkedin'
  const content = ctx.draft.editedContent ?? ctx.draft.originalContent
  const tags = (ctx.draft.platformMetadata as Record<string, unknown> | null)?.hashtags
  const hashtags = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : []
  const text = composePostText(content, hashtags, platform)
  const intentUrl = buildIntentUrl(platform, text)
  const base = { text, content, hashtags }

  let reason: string | null = null

  if (platform === 'linkedin' && !opts.forceHandoff) {
    const direct = await linkedInDirectAvailable(row.userId)
    if (direct.ok) {
      if (!opts.claimed && row.status !== 'publishing') {
        const claimed = await transitionQueueItem(row.id, [row.status as QueueStatus], { status: 'publishing' })
        if (!claimed) throw new QueueError(409, 'invalid_state', 'This post is being published right now.')
      }
      const attempts = row.attempts + 1
      // Intent marker: if this function dies after LinkedIn accepted the post
      // but before we record it, the cron sees an open intent and never posts again.
      const intentId = await insertPublishLog({
        userId: row.userId,
        queueItemId: row.id,
        draftId: row.draftId,
        platform,
        method: 'linkedin_api',
        success: null,
      })
      const settle = async (outcome: Parameters<typeof resolvePublishIntent>[1]) => {
        if (intentId) await resolvePublishIntent(intentId, outcome)
        else await insertPublishLog({ userId: row.userId, queueItemId: row.id, draftId: row.draftId, platform, method: 'linkedin_api', ...outcome })
      }
      try {
        const post = await createLinkedInPost({
          accessToken: decrypt(direct.connection.accessTokenEnc),
          authorSub: direct.connection.providerAccountId,
          text,
        })
        // Record the outcome first: everything after this point is bookkeeping.
        await settle({ success: true, statusCode: 201, externalPostId: post.urn })
        const item = await updateQueueItem(row.id, {
          status: 'published',
          publishedAt: now,
          publishMethod: 'linkedin_api',
          externalPostId: post.urn,
          externalUrl: post.url,
          attempts,
          nextAttemptAt: null,
          lastError: null,
        })
        await setDraftStatus(row.draftId, 'published')
        if (opts.notify) await sendPublishReceipt({ userId: row.userId, content: text, postUrl: post.url })
        return { ...base, status: 'published', item, result: { method: 'linkedin_api', url: post.url, intentUrl: null }, reason: null }
      } catch (err) {
        const status = err instanceof LinkedInApiError ? err.status : null
        const message = err instanceof Error ? err.message : String(err)
        await settle({ success: false, statusCode: status, error: message })

        if (err instanceof LinkedInApiError && err.isAuthError) {
          await setLinkedInStatus(row.userId, 'expired')
          const item = await updateQueueItem(row.id, {
            status: 'ready',
            attempts,
            nextAttemptAt: null,
            lastError: 'LinkedIn rejected the post because your connection expired. Reconnect LinkedIn and we will publish directly again.',
          })
          if (opts.notify) await sendLinkedInExpired(row.userId, now)
          return {
            ...base,
            status: 'ready',
            item,
            result: { method: 'manual', url: null, intentUrl },
            reason: 'Your LinkedIn connection expired.',
          }
        }

        if (opts.interactive) {
          await updateQueueItem(row.id, { status: 'ready', attempts, nextAttemptAt: null, lastError: message })
          throw new QueueError(
            502,
            'upstream_error',
            `LinkedIn rejected the post: ${message}. It's marked ready so you can post it yourself.`,
            { intentUrl },
          )
        }

        if (attempts >= MAX_PUBLISH_ATTEMPTS) {
          const item = await updateQueueItem(row.id, { status: 'failed', attempts, nextAttemptAt: null, lastError: message })
          if (opts.notify) await sendPublishFailed({ userId: row.userId, content: text, error: message })
          return { ...base, status: 'failed', item, result: { method: 'linkedin_api', url: null, intentUrl }, reason: message }
        }

        const item = await updateQueueItem(row.id, {
          status: 'scheduled',
          attempts,
          nextAttemptAt: new Date(now.getTime() + RETRY_DELAY_MS),
          lastError: message,
        })
        return { ...base, status: 'retry', item, result: { method: 'linkedin_api', url: null, intentUrl }, reason: message }
      }
    }
    reason = direct.reason
    if ('expired' in direct && direct.expired && opts.notify) await sendLinkedInExpired(row.userId, now)
  }

  const item = await updateQueueItem(row.id, {
    status: 'ready',
    nextAttemptAt: null,
    lastError: null,
    approvedAt: row.approvedAt ?? now,
    approvedBy: row.approvedBy ?? 'owner',
  })
  return {
    ...base,
    status: 'ready',
    item,
    result: { method: handoffMethod(platform), url: null, intentUrl },
    reason,
  }
}
