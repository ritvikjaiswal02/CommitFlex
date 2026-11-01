import { auth } from '@/auth'
import { getQueueStats, listQueue } from '@/lib/db/queries/autopilot'
import { QueueQuerySchema } from '@/lib/validators/autopilot'
import { invalidRequest, unauthorized } from '@/lib/validators/http'
import type { QueueStatus } from '@/types/autopilot'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const parsed = QueueQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) return invalidRequest(parsed.error)
  const q = parsed.data

  const [items, stats] = await Promise.all([
    listQueue(userId, {
      statuses: q.status as QueueStatus[] | undefined,
      platform: q.platform,
      from: q.from,
      to: q.to,
      limit: q.limit ?? 100,
    }),
    getQueueStats(userId),
  ])
  return Response.json({ items, stats })
}
