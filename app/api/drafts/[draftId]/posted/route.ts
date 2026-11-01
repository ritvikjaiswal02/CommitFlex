import { auth } from '@/auth'
import { queueErrorToResponse, recordManualPublish } from '@/lib/autopilot/queue'
import { MarkPostedSchema } from '@/lib/validators/autopilot'
import { invalidRequest, readJson, unauthorized } from '@/lib/validators/http'

/** "I posted it": marks the draft published after a hand-off. */
export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const parsed = MarkPostedSchema.safeParse((await readJson(req, {})) ?? {})
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const item = await recordManualPublish({
      userId: session.user.id,
      draftId: params.draftId,
      method: parsed.data.method,
      externalUrl: parsed.data.url ?? null,
    })
    return Response.json({ item })
  } catch (err) {
    const res = queueErrorToResponse(err)
    if (res) return res
    throw err
  }
}
