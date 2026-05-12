import { auth } from '@/auth'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { GenerateVariantsSchema } from '@/lib/validators/posts'
import { getNarrativeByJob } from '@/lib/db/queries/narratives'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { appendDraftVariants } from '@/lib/db/queries/drafts'
import { generatePost, creativityToTemperature } from '@/lib/ai/posts'
import { checkRateLimit } from '@/lib/rate-limit'
import type { Narrative } from '@/types/ai'
import type { VoiceSettings } from '@/types/jobs'

// 10 variant-generation requests per user per hour. Generating variants is 3× a
// normal call so this caps the practical hourly spend on the most expensive op.
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 }

export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(`variants:${session.user.id}`, RATE_LIMIT)
  if (!rl.allowed) return Response.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const existing = await requireDraftOwner(params.draftId, session.user.id)

    const body = await req.json().catch(() => null)
    const parsed = GenerateVariantsSchema.safeParse(body ?? {})
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    const { technical, engagement, creativity, count } = parsed.data

    const platform = existing.platform as 'linkedin' | 'twitter'
    if (platform !== 'linkedin' && platform !== 'twitter') {
      return Response.json({ error: 'Unsupported platform on draft' }, { status: 400 })
    }

    const narrativeRow = await getNarrativeByJob(existing.jobId)
    if (!narrativeRow) {
      return Response.json({ error: 'Narrative not found for job; cannot generate variants' }, { status: 404 })
    }

    const voice: VoiceSettings = (await getVoiceSettings(session.user.id)) ?? {
      tone: 'professional',
      technicalLevel: 7,
      audience: 'developers',
    }

    const narrative: Narrative = {
      theme: narrativeRow.angle,
      story: narrativeRow.story,
      keyPoints: narrativeRow.keyInsights,
      technicalDepth: Number(narrativeRow.targetAudience) || 7,
    }

    // Spread creativity across the N variants so they actually feel different.
    // Variant i gets creativity offset by ±15 around the requested value, clamped.
    const spread = (i: number) => {
      if (count <= 1) return creativity
      const t = i / (count - 1)            // 0..1
      const offset = (t - 0.5) * 30        // -15..+15
      return Math.max(0, Math.min(100, Math.round(creativity + offset)))
    }

    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        generatePost(platform, narrative, voice, {
          toneOverrides: { technical, engagement, creativity: spread(i) },
        }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }))
      )
    )

    const successful = results.filter((r): r is Awaited<ReturnType<typeof generatePost>> => 'post' in r)
    if (successful.length === 0) {
      return Response.json({ error: 'All variant generations failed' }, { status: 502 })
    }

    const drafts = await appendDraftVariants(existing.jobId, session.user.id, platform,
      successful.map(r => ({
        content: r.post.content,
        hashtags: r.post.hashtags,
        callToAction: r.post.callToAction,
      }))
    )

    return Response.json({
      drafts,
      meta: {
        requested: count,
        generated: successful.length,
        temperatures: successful.map(r => r._meta.temperature),
        sliders: { technical, engagement, creativity },
        baseTemperature: creativityToTemperature(creativity),
      },
    }, { status: 201 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
