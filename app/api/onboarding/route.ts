import { auth } from '@/auth'
import { isConfigured } from '@/lib/env'
import { getUserPlan } from '@/lib/plans'
import { detectCountry } from '@/lib/billing/currency'
import { getUserRepos } from '@/lib/db/queries/repos'
import { getAutopilotSettings, upsertAutopilotSettings } from '@/lib/db/queries/autopilot'
import { getLinkedInConnectionSummary } from '@/lib/db/queries/integrations'
import {
  getUserProfile,
  startTrialIfEligible,
  upsertUserProfile,
  type UserProfilePatchInput,
} from '@/lib/db/queries/onboarding'
import { CADENCE_DAYS, isValidTimeZone } from '@/components/onboarding/questions'
import { OnboardingPatchSchema } from '@/components/onboarding/schemas'
import type { AutopilotSettings } from '@/types/autopilot'
import { coerceAutopilotChoices, invalidRequest, readJson, unauthorized } from './_shared'

export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding?tz=Asia/Kolkata
 * Creates the profile row on first visit (with the browser's time zone),
 * starts the trial once per account, and returns everything the stepper needs
 * to resume where the user left off.
 */
export async function GET(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const tzParam = url.searchParams.get('tz')
  const tz = isValidTimeZone(tzParam) ? tzParam : null

  try {
    let profile = await getUserProfile(userId)
    if (!profile) {
      profile = await upsertUserProfile(userId, {
        timezone: tz ?? 'UTC',
        country: detectCountry(req.headers),
      })
    } else if (!profile.onboardedAt && tz && profile.timezone === 'UTC' && tz !== 'UTC') {
      profile = await upsertUserProfile(userId, { timezone: tz })
    }

    const trialEndsAt = await startTrialIfEligible(userId)
    if (trialEndsAt) profile = { ...profile, trialEndsAt }

    const [autopilot, repos, linkedin, plan] = await Promise.all([
      getAutopilotSettings(userId),
      getUserRepos(userId),
      getLinkedInConnectionSummary(userId).catch((err: unknown) => {
        console.error('[onboarding] linkedin summary failed', err)
        return null
      }),
      getUserPlan(userId),
    ])

    return Response.json({
      profile,
      autopilot,
      repos: repos.map((r) => ({ id: r.id, fullName: r.fullName })),
      linkedin,
      linkedinAvailable: isConfigured('linkedin'),
      plan: {
        id: plan.id,
        status: plan.status,
        trialEndsAt: plan.trialEndsAt ? new Date(plan.trialEndsAt).toISOString() : null,
      },
    })
  } catch (err) {
    console.error('[onboarding] GET failed', err)
    return Response.json(
      { error: 'We couldn’t load your setup. Refresh the page to try again.', code: 'internal_error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/onboarding
 * Saves answers as the user moves through the steps. Profile answers go to
 * user_profiles; cadence, time and approval go to autopilot_settings (autopilot
 * stays off until completion). Raw voice samples are validated but never
 * stored: only the fingerprint derived from them is kept, at completion.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const parsed = OnboardingPatchSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error.flatten())
  const body = parsed.data

  try {
    const profilePatch: UserProfilePatchInput = {}
    if (body.step !== undefined) profilePatch.onboardingStep = body.step
    if (body.role !== undefined) profilePatch.role = body.role
    if (body.pitch !== undefined) profilePatch.pitch = body.pitch.length > 0 ? body.pitch : null
    if (body.audiences !== undefined) profilePatch.audiences = body.audiences
    if (body.platforms !== undefined) profilePatch.platforms = body.platforms
    if (body.tonePreset !== undefined) profilePatch.tonePreset = body.tonePreset
    if (body.timezone !== undefined) profilePatch.timezone = body.timezone

    const profile = await upsertUserProfile(userId, profilePatch)

    const touchesAutopilot =
      body.cadence !== undefined || body.postTime !== undefined || body.approvalMode !== undefined || body.platforms !== undefined
    if (touchesAutopilot) {
      const plan = await getUserPlan(userId)
      const choices = coerceAutopilotChoices(plan.id, { cadence: body.cadence, approvalMode: body.approvalMode })
      const patch: Partial<Omit<AutopilotSettings, 'timezone'>> = {}
      if (choices.cadence !== undefined) {
        patch.cadence = choices.cadence
        patch.postDays = CADENCE_DAYS[choices.cadence]
      }
      if (body.postTime !== undefined) patch.postTime = body.postTime
      if (choices.approvalMode !== undefined) patch.approvalMode = choices.approvalMode
      if (body.platforms !== undefined) patch.platforms = body.platforms
      await upsertAutopilotSettings(userId, patch)
    }

    return Response.json({ profile })
  } catch (err) {
    console.error('[onboarding] PATCH failed', err)
    return Response.json(
      { error: 'We couldn’t save that answer. Check your connection and try again.', code: 'internal_error' },
      { status: 500 },
    )
  }
}
