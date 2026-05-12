import { auth } from '@/auth'
import { AnalyzeVoiceSchema } from '@/lib/validators/voice'
import { analyzeVoiceSamples } from '@/lib/ai/voice-analyzer'
import { checkRateLimit } from '@/lib/rate-limit'

// Tighter cap than /generate — analysis is cheap but we don't want abuse.
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 }

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(`voice-analyze:${session.user.id}`, RATE_LIMIT)
  if (!rl.allowed) return Response.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const parsed = AnalyzeVoiceSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const { fingerprint, _meta } = await analyzeVoiceSamples(parsed.data.samples)
    // _meta intentionally returned so the client can show token usage if needed.
    void _meta
    return Response.json({ fingerprint }, { status: 200 })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 502 },
    )
  }
}
