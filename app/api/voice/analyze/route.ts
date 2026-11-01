import { auth } from '@/auth'
import { analyzeVoiceSamples } from '@/lib/ai/voice-analyzer'
import { checkRateLimit } from '@/lib/rate-limit'
import { VoiceAnalyzeSchema } from '@/components/onboarding/schemas'
import { invalidRequest, unauthorized } from '../_shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Analysis is one model call per request; cap it per user per hour. */
const VOICE_ANALYZE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 }

/**
 * POST /api/voice/analyze { samples: string[] } → { fingerprint }
 * Reads 1–10 past posts and returns a voice fingerprint. Nothing is stored;
 * use POST /api/voice/profiles/:id/fingerprint to analyse and save in one go.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const rl = await checkRateLimit(`voice-analyze:${session.user.id}`, VOICE_ANALYZE_RATE_LIMIT)
  if (!rl.allowed) {
    return Response.json(
      { error: 'You’ve analysed your voice 5 times this hour. Try again later.', code: 'rate_limited' },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = VoiceAnalyzeSchema.safeParse(body)
  if (!parsed.success) return invalidRequest(parsed.error.flatten())

  try {
    const { fingerprint } = await analyzeVoiceSamples(parsed.data.samples)
    return Response.json({ fingerprint }, { status: 200 })
  } catch (err) {
    console.error('[voice/analyze] failed', err)
    return Response.json(
      { error: 'The writing model didn’t respond. Your posts weren’t saved; try again in a minute.', code: 'upstream_error' },
      { status: 502 },
    )
  }
}
