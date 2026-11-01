import { appUrl } from '@/lib/env'
import { getDraft } from '@/lib/db/queries/drafts'
import { approveDraft } from '@/lib/autopilot/queue'
import { queueItemToExtensionItem } from '../../../_lib/items'
import { corsJson, isUuid, notFound, preflight, withExtensionToken } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return preflight()
}

/**
 * POST /api/extension/drafts/:draftId/approve
 * Approves a draft from the extension popup or the in-page panel. Same rules
 * as the app's Approve button: it is scheduled into its slot (or the next
 * free one), and plan limits apply.
 */
export async function POST(_req: Request, { params }: { params: { draftId: string } }) {
  return withExtensionToken(_req, 'approve draft', async ({ userId }) => {
    // 404 for drafts that don't exist or belong to someone else, so a token
    // can't probe other users' ids.
    if (!isUuid(params.draftId)) return notFound('Draft not found')
    const draft = await getDraft(params.draftId)
    if (!draft || draft.userId !== userId || draft.deletedAt) return notFound('Draft not found')

    const item = await approveDraft(userId, draft.id, 'owner')
    return corsJson({ ok: true, item: queueItemToExtensionItem(item, appUrl()) })
  })
}
