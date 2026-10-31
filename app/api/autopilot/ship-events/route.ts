import { auth } from '@/auth'
import { listShipEvents } from '@/lib/db/queries/autopilot'
import { LimitQuerySchema } from '@/lib/validators/autopilot'
import { invalidRequest, unauthorized } from '@/lib/validators/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const parsed = LimitQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()))
  if (!parsed.success) return invalidRequest(parsed.error)

  const events = await listShipEvents(userId, parsed.data.limit ?? 20)
  return Response.json({ events })
}
