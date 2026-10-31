import { z } from 'zod'
import { appUrl } from '@/lib/env'
import { listQueue } from '@/lib/db/queries/autopilot'
import { listRecentDrafts } from '@/lib/db/queries/drafts'
import {
  EXTENSION_QUEUE_STATUSES,
  draftToExtensionItem,
  queueItemToExtensionItem,
  sortQueueForExtension,
} from '../_lib/items'
import { corsJson, preflight, withExtensionToken } from '../_lib/http'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  platform: z.enum(['linkedin', 'twitter']).optional(),
})

/** Queue rows returned to the extension. Generous, but bounded. */
const QUEUE_LIMIT = 50
const RECENT_LIMIT = 10

export function OPTIONS() {
  return preflight()
}

/**
 * GET /api/extension/queue?platform=linkedin|twitter
 * `queue`: ready, scheduled and pending_review items (ready first).
 * `recent`: the last 10 drafts that are not in the queue.
 */
export async function GET(req: Request) {
  return withExtensionToken(req, 'queue', async ({ userId }) => {
    const url = new URL(req.url)
    const parsed = QuerySchema.safeParse({ platform: url.searchParams.get('platform') || undefined })
    if (!parsed.success) {
      return corsJson(
        { error: 'platform must be linkedin or twitter', code: 'invalid_request', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { platform } = parsed.data
    const base = appUrl()

    const [queueItems, recentDrafts] = await Promise.all([
      listQueue(userId, { statuses: EXTENSION_QUEUE_STATUSES, platform, limit: QUEUE_LIMIT }),
      listRecentDrafts(userId, { platform, limit: RECENT_LIMIT, unqueuedOnly: true }),
    ])

    const queue = sortQueueForExtension(queueItems.map((item) => queueItemToExtensionItem(item, base)))
    const queuedDraftIds = new Set(queue.map((item) => item.draftId))
    const recent = recentDrafts
      .filter((draft) => !queuedDraftIds.has(draft.id))
      .slice(0, RECENT_LIMIT)
      .map((draft) => draftToExtensionItem(draft, base))

    const counts = {
      ready: queue.filter((item) => item.status === 'ready').length,
      scheduled: queue.filter((item) => item.status === 'scheduled').length,
      pendingReview: queue.filter((item) => item.status === 'pending_review').length,
    }

    return corsJson({ queue, recent, counts, appUrl: base })
  })
}
