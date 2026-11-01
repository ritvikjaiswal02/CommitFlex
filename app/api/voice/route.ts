import { auth } from '@/auth'
import { getVoiceSettings, upsertVoiceSettings } from '@/lib/db/queries/voice'
import { VoiceFieldsSchema, invalidRequest, serverError, unauthorized } from './_shared'

export const dynamic = 'force-dynamic'

/** GET /api/voice — the default voice profile in the shape the generator reads. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  try {
    const settings = await getVoiceSettings(session.user.id)
    return Response.json({ settings })
  } catch (err) {
    console.error('[voice] GET failed', err)
    return serverError('We couldn’t load your voice. Try again.')
  }
}

/** PUT /api/voice — updates the default voice profile, creating it on first use. */
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const body = await req.json().catch(() => null)
  const parsed = VoiceFieldsSchema.safeParse(body)
  if (!parsed.success) return invalidRequest(parsed.error.flatten())

  try {
    const settings = await upsertVoiceSettings(session.user.id, parsed.data)
    return Response.json({ settings })
  } catch (err) {
    console.error('[voice] PUT failed', err)
    return serverError('We couldn’t save your voice. Try again.')
  }
}
