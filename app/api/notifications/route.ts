import { z } from 'zod'
import { auth } from '@/auth'
import { getPrefs, upsertPrefs } from '@/lib/db/queries/notifications'

const PrefsSchema = z.object({
  emailOnComplete: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const prefs = await getPrefs(session.user.id)
  return Response.json({ prefs })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = PrefsSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const prefs = await upsertPrefs(session.user.id, parsed.data)
  return Response.json({ prefs })
}
