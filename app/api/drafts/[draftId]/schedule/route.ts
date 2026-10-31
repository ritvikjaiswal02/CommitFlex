import { auth } from '@/auth'
import { queueErrorToResponse, scheduleDraft, unscheduleDraft } from '@/lib/autopilot/queue'
import { ScheduleDraftSchema } from '@/lib/validators/autopilot'
import { invalidRequest, readJson, unauthorized } from '@/lib/validators/http'

/** Schedules the draft at `at`, or the next free slot when `at` is omitted. */
export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const parsed = ScheduleDraftSchema.safeParse((await readJson(req, {})) ?? {})
  if (!parsed.success) return invalidRequest(parsed.error, 'Send `at` as an ISO date with a timezone offset.')

  try {
    const item = await scheduleDraft(session.user.id, params.draftId, parsed.data.at ? new Date(parsed.data.at) : 'next_slot')
    return Response.json({ item })
  } catch (err) {
    const res = queueErrorToResponse(err)
    if (res) return res
    throw err
  }
}

/** Takes the draft off the schedule (back to approved or needs review). */
export async function DELETE(_req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  try {
    const item = await unscheduleDraft(session.user.id, params.draftId)
    return Response.json({ item })
  } catch (err) {
    const res = queueErrorToResponse(err)
    if (res) return res
    throw err
  }
}
