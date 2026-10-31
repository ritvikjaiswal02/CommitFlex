import { auth } from '@/auth'
import { setDefaultProfile } from '@/lib/db/queries/voice'
import { ownProfile, serializeProfile, serverError, unauthorized } from '../../../_shared'

export const dynamic = 'force-dynamic'

/** POST /api/voice/profiles/:id/default — makes this the profile autopilot writes with. */
export async function POST(_req: Request, { params }: { params: { profileId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  try {
    const own = await ownProfile(params.profileId, userId)
    if ('error' in own) return own.error

    const updated = await setDefaultProfile(userId, params.profileId)
    if (!updated) return Response.json({ error: 'Voice profile not found', code: 'not_found' }, { status: 404 })
    return Response.json({ profile: serializeProfile(updated) })
  } catch (err) {
    console.error('[voice/profiles/:id/default] failed', err)
    return serverError('We couldn’t change your default voice. Try again.')
  }
}
