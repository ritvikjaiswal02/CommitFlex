import { auth } from '@/auth'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { GenerateVariantsSchema } from '@/lib/validators/posts'
import { apiError, invalidRequest, readJson, unauthorized } from '@/lib/validators/http'
import { appendDraftVariants } from '@/lib/db/queries/drafts'
import { generatePost, creativityToTemperature } from '@/lib/ai/posts'
import { assertFeature, planErrorToResponse, refundUsage, reserveUsage } from '@/lib/plans'
import { loadRedraftContext } from '@/lib/pipeline/redraft'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// 10 variant requests per user per hour. Each request is several model calls,
// so this caps the hourly spend on the most expensive operation.
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 }

export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const rl = await checkRateLimit(`variants:${userId}`, RATE_LIMIT)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  let reserved: { period: string; amount: number } | null = null
  try {
    const existing = await requireDraftOwner(params.draftId, userId)

    const parsed = GenerateVariantsSchema.safeParse((await readJson(req, {})) ?? {})
    if (!parsed.success) return invalidRequest(parsed.error)
    const { technical, engagement, creativity, count } = parsed.data

    const platform = existing.platform as 'linkedin' | 'twitter'
    if (platform !== 'linkedin' && platform !== 'twitter') {
      return apiError(400, 'invalid_request', 'This draft has an unsupported platform.')
    }

    await assertFeature(userId, 'drafts.variants')

    const ctx = await loadRedraftContext(existing.jobId, userId)
    if (!ctx) return apiError(404, 'not_found', 'This draft has no story to write variants from.')

    // Each variant is a model call and counts as one generation. Reserve them
    // all up front, atomically, and give back the ones that fail.
    reserved = { period: (await reserveUsage(userId, 'generations', count)).period, amount: count }

    // Spread creativity across the N variants so they actually feel different:
    // variant i is offset by up to ±15 around the requested value.
    const spread = (i: number) => {
      if (count <= 1) return creativity
      const t = i / (count - 1)
      const offset = (t - 0.5) * 30
      return Math.max(0, Math.min(100, Math.round(creativity + offset)))
    }

    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        generatePost(platform, ctx.narrative, ctx.voice, {
          toneOverrides: { technical, engagement, creativity: spread(i) },
          authorContext: ctx.authorContext,
        }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })),
      ),
    )

    const successful = results.filter((r): r is Awaited<ReturnType<typeof generatePost>> => 'post' in r)
    const unused = count - successful.length
    if (unused > 0) await refundUsage(userId, unused, 'generations', reserved.period)
    reserved = null
    if (successful.length === 0) {
      return apiError(502, 'upstream_error', 'The writing model could not produce variants. Try again in a minute.')
    }

    const drafts = await appendDraftVariants(
      existing.jobId,
      userId,
      platform,
      successful.map((r) => ({
        content: r.post.content,
        hashtags: r.post.hashtags,
        callToAction: r.post.callToAction,
      })),
    )

    return Response.json(
      {
        drafts,
        meta: {
          requested: count,
          generated: successful.length,
          temperatures: successful.map((r) => r._meta.temperature),
          sliders: { technical, engagement, creativity },
          baseTemperature: creativityToTemperature(creativity),
        },
      },
      { status: 201 },
    )
  } catch (err) {
    if (reserved) await refundUsage(userId, reserved.amount, 'generations', reserved.period)
    const res = ownershipErrorToResponse(err) ?? planErrorToResponse(err)
    if (res) return res
    console.error('[drafts/variants] failed', err)
    return apiError(500, 'internal_error', 'Variants could not be generated.')
  }
}
