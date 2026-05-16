import { auth } from '@/auth'
import { getVoiceProfile, setDefaultProfile } from '@/lib/db/queries/voice'

export async function POST(_req: Request, { params }: { params: { profileId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getVoiceProfile(params.profileId)
  if (!profile) return Response.json({ error: 'Not found' }, { status: 404 })
  if (profile.userId !== session.user.id) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const updated = await setDefaultProfile(session.user.id, params.profileId)
  return Response.json({ profile: updated })
}
