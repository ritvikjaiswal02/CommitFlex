import { auth } from '@/auth'
import { upsertUserProfile, type UserProfilePatchInput } from '@/lib/db/queries/onboarding'
import { UserProfilePatchSchema } from '@/components/onboarding/schemas'

export const dynamic = 'force-dynamic'

/** PATCH /api/user/profile — role, pitch, audiences, platforms, tone preset and time zone. */
export async function PATCH(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return Response.json({ error: 'Sign in to continue', code: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = UserProfilePatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Some fields need another look', code: 'invalid_request', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const data = parsed.data
  const patch: UserProfilePatchInput = {}
  if (data.role !== undefined) patch.role = data.role
  if (data.pitch !== undefined) patch.pitch = data.pitch && data.pitch.length > 0 ? data.pitch : null
  if (data.audiences !== undefined) patch.audiences = data.audiences
  if (data.platforms !== undefined) patch.platforms = data.platforms
  if (data.tonePreset !== undefined) patch.tonePreset = data.tonePreset
  if (data.timezone !== undefined) patch.timezone = data.timezone

  try {
    const profile = await upsertUserProfile(userId, patch)
    return Response.json({ profile })
  } catch (err) {
    console.error('[user/profile] PATCH failed', err)
    return Response.json({ error: 'We couldn’t save your profile. Try again.', code: 'internal_error' }, { status: 500 })
  }
}
