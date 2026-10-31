import { auth } from '@/auth'
import { queueErrorToResponse, skipDraft } from '@/lib/autopilot/queue'
import { unauthorized } from '@/lib/validators/http'

export async function POST(_req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  try {
    const item = await skipDraft(session.user.id, params.draftId)
    return Response.json({ item })
  } catch (err) {
    const res = queueErrorToResponse(err)
    if (res) return res
    throw err
  }
}
