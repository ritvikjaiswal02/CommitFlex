import { auth } from '@/auth'
import { z } from 'zod'
import { updateVoiceProfile, deleteVoiceProfile } from '@/lib/db/queries/voice'
import {
  EXTRA_CONTEXT_MAX,
  invalidRequest,
  ownProfile,
  serializeProfile,
  serverError,
  unauthorized,
} from '../../_shared'

export const dynamic = 'force-dynamic'

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Give the profile a name').max(60).optional(),
  tone: z.string().trim().min(1).max(50).optional(),
  technicalLevel: z.number().int().min(1).max(10).optional(),
  audience: z.string().trim().min(1).max(100).optional(),
  extraContext: z.string().max(EXTRA_CONTEXT_MAX).optional(),
})

export async function PATCH(req: Request, { params }: { params: { profileId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null)
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) return invalidRequest(parsed.error.flatten())

  try {
    const own = await ownProfile(params.profileId, userId)
    if ('error' in own) return own.error
    const profile = await updateVoiceProfile(params.profileId, parsed.data)
    if (!profile) return Response.json({ error: 'Voice profile not found', code: 'not_found' }, { status: 404 })
    return Response.json({ profile: serializeProfile(profile) })
  } catch (err) {
    console.error('[voice/profiles/:id] PATCH failed', err)
    return serverError('We couldn’t save the profile. Try again.')
  }
}

export async function DELETE(_req: Request, { params }: { params: { profileId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  try {
    const own = await ownProfile(params.profileId, userId)
    if ('error' in own) return own.error

    const result = await deleteVoiceProfile(userId, params.profileId)
    if (!result.deleted) {
      if (result.reason === 'last_profile') {
        return Response.json(
          { error: 'You need at least one voice profile. Add another before deleting this one.', code: 'last_profile' },
          { status: 409 },
        )
      }
      return Response.json({ error: 'Voice profile not found', code: 'not_found' }, { status: 404 })
    }
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('[voice/profiles/:id] DELETE failed', err)
    return serverError('We couldn’t delete the profile. Try again.')
  }
}
