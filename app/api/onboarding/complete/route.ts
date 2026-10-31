import { createElement } from 'react'
import { auth } from '@/auth'
import { appUrl } from '@/lib/env'
import { getUserPlan } from '@/lib/plans'
import { detectCountry } from '@/lib/billing/currency'
import { analyzeVoiceSamples } from '@/lib/ai/voice-analyzer'
import { getUserRepos } from '@/lib/db/queries/repos'
import { upsertAutopilotSettings } from '@/lib/db/queries/autopilot'
import { getLinkedInConnectionSummary } from '@/lib/db/queries/integrations'
import { getUserProfile, startTrialIfEligible, upsertUserProfile } from '@/lib/db/queries/onboarding'
import { createVoiceProfile, getDefaultVoiceProfile, updateVoiceProfile } from '@/lib/db/queries/voice'
import { runInBackground, startGenerationJob } from '@/lib/pipeline/start'
import { continuePrefetchedJob } from '@/lib/pipeline/run'
import { getOnboardingPrefetchJob, releasePrefetchedJob } from '@/lib/db/queries/jobs'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/mailer'
import { WelcomeEmail } from '@/lib/email/templates/welcome'
import { CADENCE_DAYS, TONE_TO_VOICE, audienceSummary } from '@/components/onboarding/questions'
import { OnboardingCompleteSchema } from '@/components/onboarding/schemas'
import { coerceAutopilotChoices, invalidRequest, readJson, unauthorized } from '../_shared'

export const dynamic = 'force-dynamic'
// The voice analysis is one model call; give it room on serverless.
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const FIRST_WINDOW_DAYS = 14
// Each call can run a voice-analysis model call and start a job.
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 }

/**
 * POST /api/onboarding/complete
 * Saves the answers, confirms the trial, writes the default voice profile and
 * the autopilot settings (enabled), and starts the first job so drafts are
 * already being written when the user lands on Today.
 */
export async function POST(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const parsed = OnboardingCompleteSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error.flatten())
  const input = parsed.data

  const rl = await checkRateLimit(`onboarding-complete:${userId}`, RATE_LIMIT)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const repos = await getUserRepos(userId)
    if (repos.length === 0) {
      return Response.json(
        { error: 'Connect at least one repository before starting autopilot.', code: 'no_repos' },
        { status: 409 },
      )
    }

    const previous = await getUserProfile(userId)
    const firstCompletion = !previous?.onboardedAt

    // 1. Profile. Creating it here too covers a client that skipped GET.
    const now = new Date()
    await upsertUserProfile(userId, {
      role: input.role,
      pitch: input.pitch && input.pitch.length > 0 ? input.pitch : null,
      audiences: input.audiences,
      platforms: input.platforms,
      tonePreset: input.tonePreset,
      timezone: input.timezone,
      country: previous?.country ?? detectCountry(req.headers),
      onboardingStep: 'done',
      onboardedAt: previous?.onboardedAt ?? now,
      ...(input.notifyEmail ? { notifyEmail: input.notifyEmail } : {}),
    })

    // 2. Trial (normally already started by GET /api/onboarding; idempotent).
    await startTrialIfEligible(userId)
    const plan = await getUserPlan(userId)
    const trialEndsAt = plan.trialEndsAt ? new Date(plan.trialEndsAt).toISOString() : null

    // 3. Voice: tone preset + audiences, and a fingerprint when samples were given.
    let fingerprint: string | null = null
    let voiceWarning: string | null = null
    const existingVoice = await getDefaultVoiceProfile(userId)
    // Re-submitting onboarding (back button, double click) must not pay for
    // another analysis when the profile already has a fingerprint.
    const alreadyAnalysed = !firstCompletion && !!existingVoice?.extraContext
    if (input.voiceSamples.length > 0 && !alreadyAnalysed) {
      try {
        fingerprint = (await analyzeVoiceSamples(input.voiceSamples)).fingerprint
      } catch (err) {
        console.error('[onboarding] voice analysis failed', err)
        voiceWarning =
          'We couldn’t analyse your sample posts just now. Your tone is saved; add samples again from Settings, Voice.'
      }
    }

    const voiceFields = {
      ...TONE_TO_VOICE[input.tonePreset],
      audience: audienceSummary(input.audiences),
      ...(fingerprint ? { extraContext: fingerprint } : {}),
    }
    const voice = existingVoice
      ? ((await updateVoiceProfile(existingVoice.id, voiceFields)) ?? existingVoice)
      : await createVoiceProfile(userId, {
          name: 'Default',
          makeDefault: true,
          ...voiceFields,
          extraContext: fingerprint ?? undefined,
        })

    // 4. Autopilot, switched on.
    const choices = coerceAutopilotChoices(plan.id, { cadence: input.cadence, approvalMode: input.approvalMode })
    const cadence = choices.cadence ?? 'ship_moments'
    await upsertAutopilotSettings(userId, {
      enabled: true,
      cadence,
      postDays: CADENCE_DAYS[cadence],
      postTime: input.postTime,
      approvalMode: choices.approvalMode ?? 'review',
      platforms: input.platforms,
      defaultVoiceProfileId: voice.id,
      pausedUntil: null,
    })

    // 5. Repos were connected by the client in step 1; pick the first one to draft from.
    const autopilotRepos = repos.filter((r) => r.autopilotEnabled !== false)
    const candidates = autopilotRepos.length > 0 ? autopilotRepos : repos
    const prefetched = firstCompletion ? await getOnboardingPrefetchJob(userId).catch(() => null) : null
    const firstRepo =
      (prefetched && candidates.find((r) => r.id === prefetched.repoId)) ||
      (input.firstRepoId && candidates.find((r) => r.id === input.firstRepoId)) ||
      [...candidates].sort((a, b) => new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime())[0]

    // 6. First job: the last two weeks, auto-queued. When the prefetch
    // already read and summarised them, only the writing is left.
    let jobId: string | null = null
    let jobError: string | null = null
    if (!firstCompletion) {
      // Onboarding was already completed once: never start a second first run.
    } else if (prefetched && prefetched.repoId === firstRepo.id) {
      jobId = prefetched.id
      await releasePrefetchedJob(prefetched.id, voice.id)
      runInBackground(continuePrefetchedJob(prefetched.id))
    } else {
      try {
        const result = await startGenerationJob({
          userId,
          repoId: firstRepo.id,
          source: { type: 'window', windowStart: new Date(now.getTime() - FIRST_WINDOW_DAYS * DAY_MS), windowEnd: now },
          trigger: 'onboarding',
          voiceProfileId: voice.id,
          autoQueue: true,
        })
        if (result.ok) jobId = result.jobId
        else {
          jobId = result.jobId ?? null
          if (!jobId) jobError = result.error
        }
      } catch (err) {
        console.error('[onboarding] first job failed to start', err)
        jobError = 'We couldn’t start your first drafts. Run autopilot from Today when you’re ready.'
      }
    }

    // Welcome email, once. Never blocks completion.
    if (firstCompletion && session.user?.email) {
      try {
        const linkedin = await getLinkedInConnectionSummary(userId).catch(() => null)
        const base = appUrl()
        await sendEmail({
          to: session.user.email,
          subject: 'Autopilot is on',
          react: createElement(WelcomeEmail, {
            firstName: (session.user.name ?? '').trim().split(/\s+/)[0] || 'there',
            dashboardUrl: `${base}/dashboard`,
            extensionUrl: `${base}/extension`,
            linkedinConnected: linkedin?.status === 'active',
          }),
        })
      } catch (err) {
        console.error('[onboarding] welcome email failed', err)
      }
    }

    return Response.json({
      ok: true,
      jobId,
      trialEndsAt,
      redirectTo: '/dashboard',
      repoFullName: firstRepo.fullName,
      ...(jobError ? { jobError } : {}),
      ...(voiceWarning ? { voiceWarning } : {}),
      ...(choices.downgraded.length > 0 ? { downgraded: choices.downgraded } : {}),
    })
  } catch (err) {
    console.error('[onboarding] complete failed', err)
    return Response.json(
      { error: 'We couldn’t start autopilot. Your answers are saved, so try again in a moment.', code: 'internal_error' },
      { status: 500 },
    )
  }
}
