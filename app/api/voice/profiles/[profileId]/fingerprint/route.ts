import { auth } from '@/auth'
import { analyzeVoiceSamples } from '@/lib/ai/voice-analyzer'
import { checkRateLimit } from '@/lib/rate-limit'
import { assertFeature, planErrorToResponse } from '@/lib/plans'
import { updateVoiceProfile } from '@/lib/db/queries/voice'
import { VoiceAnalyzeSchema } from '@/components/onboarding/schemas'
import { invalidRequest, ownProfile, serializeProfile, serverError, unauthorized } from '../../../_shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 }

/**
 * POST /api/voice/profiles/:id/fingerprint { samples } → { profile, fingerprint }
 * Analyses past posts and saves the fingerprint on the profile. The posts
 * themselves are not stored.
 */
export async function POST(req: Request, { params }: { params: { profileId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null)
  const parsed = VoiceAnalyzeSchema.safeParse(body)
  if (!parsed.success) return invalidRequest(parsed.error.flatten())

  try {
    const own = await ownProfile(params.profileId, userId)
    if ('error' in own) return own.error
    await assertFeature(userId, 'voice.fingerprint')
  } catch (err) {
    const res = planErrorToResponse(err)
    if (res) return res
    console.error('[voice/fingerprint] precheck failed', err)
    return serverError('We couldn’t check this profile. Try again.')
  }

  // Same bucket as /api/voice/analyze: both make one model call.
  const rl = await checkRateLimit(`voice-analyze:${userId}`, RATE_LIMIT)
  if (!rl.allowed) {
    return Response.json(
      { error: 'You’ve analysed your voice 5 times this hour. Try again later.', code: 'rate_limited' },
      { status: 429 },
    )
  }

  let fingerprint: string
  try {
    fingerprint = (await analyzeVoiceSamples(parsed.data.samples)).fingerprint
  } catch (err) {
    console.error('[voice/fingerprint] analysis failed', err)
    return Response.json(
      { error: 'The writing model didn’t respond. Nothing changed; try again in a minute.', code: 'upstream_error' },
      { status: 502 },
    )
  }

  try {
    const profile = await updateVoiceProfile(params.profileId, { extraContext: fingerprint })
    if (!profile) return Response.json({ error: 'Voice profile not found', code: 'not_found' }, { status: 404 })
    return Response.json({ profile: serializeProfile(profile), fingerprint })
  } catch (err) {
    console.error('[voice/fingerprint] save failed', err)
    return serverError('We analysed your posts but couldn’t save the result. Try again.')
  }
}
