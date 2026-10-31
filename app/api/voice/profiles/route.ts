import { auth } from '@/auth'
import { z } from 'zod'
import { assertWithinLimit, planErrorToResponse } from '@/lib/plans'
import { listVoiceProfiles, createVoiceProfile } from '@/lib/db/queries/voice'
import { EXTRA_CONTEXT_MAX, invalidRequest, serializeProfile, serverError, unauthorized } from '../_shared'

export const dynamic = 'force-dynamic'

const CreateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Give the profile a name').max(60),
  tone: z.string().trim().min(1).max(50),
  technicalLevel: z.number().int().min(1).max(10),
  audience: z.string().trim().min(1).max(100),
  extraContext: z.string().max(EXTRA_CONTEXT_MAX).optional().default(''),
  makeDefault: z.boolean().optional().default(false),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  try {
    const profiles = await listVoiceProfiles(session.user.id)
    return Response.json({ profiles: profiles.map(serializeProfile) })
  } catch (err) {
    console.error('[voice/profiles] GET failed', err)
    return serverError('We couldn’t load your voice profiles. Try again.')
  }
}

/** POST /api/voice/profiles — creates a profile within the plan's `voiceProfiles` limit. */
export async function POST(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null)
  const parsed = CreateProfileSchema.safeParse(body)
  if (!parsed.success) return invalidRequest(parsed.error.flatten())

  try {
    await assertWithinLimit(userId, 'voiceProfiles')
  } catch (err) {
    const res = planErrorToResponse(err)
    if (res) return res
    console.error('[voice/profiles] limit check failed', err)
    return serverError('We couldn’t check your plan. Try again.')
  }

  try {
    const profile = await createVoiceProfile(userId, parsed.data)
    return Response.json({ profile: serializeProfile(profile) }, { status: 201 })
  } catch (err) {
    console.error('[voice/profiles] POST failed', err)
    return serverError('We couldn’t create the profile. Try again.')
  }
}
