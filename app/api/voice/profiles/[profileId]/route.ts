import { auth } from '@/auth'
import { z } from 'zod'
import {
  getVoiceProfile,
  updateVoiceProfile,
  deleteVoiceProfile,
} from '@/lib/db/queries/voice'

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  tone: z.string().min(1).max(50).optional(),
  technicalLevel: z.number().int().min(1).max(10).optional(),
  audience: z.string().min(1).max(100).optional(),
  extraContext: z.string().max(2000).optional(),
})

async function ownProfile(profileId: string, userId: string) {
  const profile = await getVoiceProfile(profileId)
  if (!profile) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }
  if (profile.userId !== userId) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  return { profile }
}

export async function PATCH(req: Request, { params }: { params: { profileId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const own = await ownProfile(params.profileId, session.user.id)
  if ('error' in own) return own.error

  const body = await req.json().catch(() => null)
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const profile = await updateVoiceProfile(params.profileId, parsed.data)
  return Response.json({ profile })
}

export async function DELETE(_req: Request, { params }: { params: { profileId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const own = await ownProfile(params.profileId, session.user.id)
  if ('error' in own) return own.error

  const result = await deleteVoiceProfile(session.user.id, params.profileId)
  if (!result.deleted) {
    const msg = result.reason === 'last_profile'
      ? 'Can’t delete your only voice profile. Add another first.'
      : 'Profile not found'
    return Response.json({ error: msg }, { status: 400 })
  }
  return new Response(null, { status: 204 })
}
