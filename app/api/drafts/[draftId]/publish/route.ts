import { auth } from '@/auth'
import { publishDraftNow, queueErrorToResponse } from '@/lib/autopilot/queue'
import { PublishDraftSchema } from '@/lib/validators/autopilot'
import { invalidRequest, readJson, unauthorized } from '@/lib/validators/http'

/**
 * Publishes now. LinkedIn goes through the API when connected and on a plan
 * with `publish.linkedin_direct`; otherwise the item becomes `ready` and
 * `result.intentUrl` opens the pre-filled composer.
 */
export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const parsed = PublishDraftSchema.safeParse((await readJson(req, {})) ?? {})
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const { item, result } = await publishDraftNow(session.user.id, params.draftId, { method: parsed.data.method })
    return Response.json({ item, result })
  } catch (err) {
    const res = queueErrorToResponse(err)
    if (res) return res
    throw err
  }
}
