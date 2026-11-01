import { z } from 'zod'
import { auth } from '@/auth'
import { getPrefs, upsertPrefs } from '@/lib/db/queries/notifications'
import { invalidRequest, readJson, unauthorized } from '@/lib/validators/http'

const PrefsSchema = z
  .object({
    emailOnComplete: z.boolean(),
    weeklyDigest: z.boolean(),
    productUpdates: z.boolean(),
    approvalRequests: z.boolean(),
    readyToPost: z.boolean(),
    publishReceipts: z.boolean(),
  })
  .partial()
  .strict()

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const prefs = await getPrefs(session.user.id)
  return Response.json({ prefs })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const parsed = PrefsSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error)

  const prefs = await upsertPrefs(session.user.id, parsed.data)
  return Response.json({ prefs })
}
