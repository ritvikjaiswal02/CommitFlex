import { auth } from '@/auth'
import { getVoiceSettings, upsertVoiceSettings } from '@/lib/db/queries/voice'
import { z } from 'zod'

const VoiceSettingsSchema = z.object({
  tone: z.string().min(1).max(50),
  technicalLevel: z.number().int().min(1).max(10),
  audience: z.string().min(1).max(100),
  extraContext: z.string().max(500).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getVoiceSettings(session.user.id)
  return Response.json({ settings })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = VoiceSettingsSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const settings = await upsertVoiceSettings(session.user.id, parsed.data)
  return Response.json({ settings })
}
