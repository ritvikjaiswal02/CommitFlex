import { auth } from '@/auth'
import { getUserProfile, startTrialIfEligible } from '@/lib/db/queries/onboarding'
import { getOnboardingPrefetchJob } from '@/lib/db/queries/jobs'
import { getRepo } from '@/lib/db/queries/repos'
import { startGenerationJob } from '@/lib/pipeline/start'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { OnboardingPrefetchSchema } from '@/components/onboarding/schemas'
import { invalidRequest, readJson, unauthorized } from '../_shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
/** Same window /complete would use for the first drafts. */
const FIRST_WINDOW_DAYS = 14
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 6 }

/**
 * POST /api/onboarding/prefetch { repoId }
 * Called right after the repos step. Starts the slow half of the first run
 * (reading and summarising the last two weeks of commits) while the user
 * answers the remaining questions; /complete then only writes the posts, so
 * drafts land seconds after "Start autopilot". Best effort: any failure here
 * just means /complete runs the whole pipeline as before.
 */
export async function POST(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const parsed = OnboardingPrefetchSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error.flatten())

  const rl = await checkRateLimit(`onboarding-prefetch:${userId}`, RATE_LIMIT)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const profile = await getUserProfile(userId)
    if (profile?.onboardedAt) return Response.json({ ok: true, skipped: 'already_onboarded' })

    const repo = await getRepo(parsed.data.repoId)
    if (!repo || repo.userId !== userId || repo.deletedAt) {
      return Response.json({ error: 'That repository is not connected to your account.', code: 'not_found' }, { status: 404 })
    }

    const existing = await getOnboardingPrefetchJob(userId, repo.id)
    if (existing) return Response.json({ ok: true, jobId: existing.id })

    // The trial has to exist before usage is reserved against the plan.
    await startTrialIfEligible(userId)

    const now = new Date()
    const result = await startGenerationJob({
      userId,
      repoId: repo.id,
      source: { type: 'window', windowStart: new Date(now.getTime() - FIRST_WINDOW_DAYS * DAY_MS), windowEnd: now },
      trigger: 'onboarding',
      autoQueue: true,
      mode: 'prefetch',
    })
    if (!result.ok) return Response.json({ ok: false, skipped: result.code })
    return Response.json({ ok: true, jobId: result.jobId }, { status: 202 })
  } catch (err) {
    console.error('[onboarding] prefetch failed', err)
    return Response.json({ ok: false, skipped: 'internal_error' })
  }
}
