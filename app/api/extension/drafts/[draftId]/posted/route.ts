import { z } from 'zod'
import { appUrl } from '@/lib/env'
import { getDraft } from '@/lib/db/queries/drafts'
import { recordManualPublish, undoExtensionPublish } from '@/lib/autopilot/queue'
import { queueItemToExtensionItem } from '../../../_lib/items'
import { corsJson, isUuid, notFound, preflight, readJsonBody, withExtensionToken } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  url: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => /^https:\/\//i.test(value), 'url must be an https URL')
    .optional()
    .nullable(),
})

export function OPTIONS() {
  return preflight()
}

/**
 * POST /api/extension/drafts/:draftId/posted  { url?: string }
 * Records that the user posted this draft through the extension
 * (queue item → published, method 'extension').
 */
export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  return withExtensionToken(req, 'mark posted', async ({ userId }) => {
    const body = await readJsonBody(req)
    const parsed = BodySchema.safeParse(body ?? null)
    if (!parsed.success) {
      return corsJson(
        { error: 'Send { url?: string } with an https URL', code: 'invalid_request', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // Token routes answer 404 for drafts that don't exist or belong to someone
    // else, so a token can't probe other users' ids.
    if (!isUuid(params.draftId)) return notFound('Draft not found')
    const draft = await getDraft(params.draftId)
    if (!draft || draft.userId !== userId || draft.deletedAt) return notFound('Draft not found')

    const item = await recordManualPublish({
      userId,
      draftId: draft.id,
      method: 'extension',
      externalUrl: parsed.data.url ?? null,
    })

    return corsJson({ ok: true, item: queueItemToExtensionItem(item, appUrl()) })
  })
}

/**
 * DELETE /api/extension/drafts/:draftId/posted
 * Undo for the extension's automatic "Marked as posted": only an item the
 * extension itself marked can go back to ready.
 */
export async function DELETE(req: Request, { params }: { params: { draftId: string } }) {
  return withExtensionToken(req, 'undo mark posted', async ({ userId }) => {
    if (!isUuid(params.draftId)) return notFound('Draft not found')
    const draft = await getDraft(params.draftId)
    if (!draft || draft.userId !== userId || draft.deletedAt) return notFound('Draft not found')
    const item = await undoExtensionPublish(userId, draft.id)
    return corsJson({ ok: true, item: queueItemToExtensionItem(item, appUrl()) })
  })
}
