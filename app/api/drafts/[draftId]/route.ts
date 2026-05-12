import { auth } from '@/auth'
import { updateDraftContent, markDraftCopied } from '@/lib/db/queries/drafts'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { UpdateDraftSchema } from '@/lib/validators/posts'

export async function PATCH(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireDraftOwner(params.draftId, session.user.id)

    const body = await req.json().catch(() => null)
    const parsed = UpdateDraftSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

    const draft = await updateDraftContent(params.draftId, parsed.data.content)
    return Response.json({ draft })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}

export async function POST(_req: Request, { params }: { params: { draftId: string } }) {
  // Mark as copied (copy-to-clipboard action)
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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
