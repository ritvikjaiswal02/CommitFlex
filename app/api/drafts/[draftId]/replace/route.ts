import { auth } from '@/auth'
import { replaceDraft } from '@/lib/db/queries/drafts'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { ReplaceDraftSchema } from '@/lib/validators/posts'
import { apiError, invalidRequest, readJson, unauthorized } from '@/lib/validators/http'
import { planErrorToResponse, refundUsage, reserveUsage } from '@/lib/plans'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { generatePost } from '@/lib/ai/posts'
import { loadRedraftContext } from '@/lib/pipeline/redraft'

// 20 rewrites per user per hour: each one is a model call.
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 20 }

/** Rewrites one draft from the job's narrative. Counts as one generation. */
export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const rl = await checkRateLimit(`replace:${userId}`, RATE_LIMIT)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  let reserved: { period: string } | null = null
  try {
    const existing = await requireDraftOwner(params.draftId, userId)

    const parsed = ReplaceDraftSchema.safeParse(await readJson(req))
    if (!parsed.success) return invalidRequest(parsed.error)
    const platform = parsed.data.platform as 'linkedin' | 'twitter'

    const ctx = await loadRedraftContext(existing.jobId, userId)
    if (!ctx) return apiError(404, 'not_found', 'This draft has no story to rewrite from. Generate a new draft instead.')

    // Reserve before the model call; refunded below if it fails.
    reserved = await reserveUsage(userId, 'generations', 1)
    const generated = await generatePost(platform, ctx.narrative, ctx.voice, { authorContext: ctx.authorContext })
    reserved = null

    const draft = await replaceDraft(params.draftId, existing.jobId, userId, {
      platform,
      content: generated.post.content,
      hashtags: generated.post.hashtags,
    })

    return Response.json({ draft }, { status: 201 })
  } catch (err) {
    if (reserved) await refundUsage(userId, 1, 'generations', reserved.period)
    const res = ownershipErrorToResponse(err) ?? planErrorToResponse(err)
    if (res) return res
    console.error('[drafts/replace] failed', err)
    return apiError(502, 'upstream_error', 'The writing model could not rewrite this draft. Try again in a minute.')
  }
}
