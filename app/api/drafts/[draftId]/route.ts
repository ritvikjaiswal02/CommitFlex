import { auth } from '@/auth'
import { updateDraftContent, markDraftCopied } from '@/lib/db/queries/drafts'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { UpdateDraftSchema } from '@/lib/validators/posts'
import { invalidRequest, readJson, unauthorized } from '@/lib/validators/http'
import { requireReReviewAfterEdit } from '@/lib/autopilot/queue'

export async function PATCH(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  try {
    await requireDraftOwner(params.draftId, session.user.id)

    const parsed = UpdateDraftSchema.safeParse(await readJson(req))
    if (!parsed.success) return invalidRequest(parsed.error)

    const draft = await updateDraftContent(params.draftId, parsed.data.content)
    // A Team reviewer approved the old text; the new text needs their review.
    const backToReview = await requireReReviewAfterEdit(session.user.id, params.draftId).catch((err) => {
      console.error('[drafts] re-review check failed', err)
      return false
    })
    return Response.json({ draft, ...(backToReview ? { backToReview: true } : {}) })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}

/** Marks the draft as copied (copy-to-clipboard action). */
export async function POST(_req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  try {
    await requireDraftOwner(params.draftId, session.user.id)
    await markDraftCopied(params.draftId)
    return new Response(null, { status: 204 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}
