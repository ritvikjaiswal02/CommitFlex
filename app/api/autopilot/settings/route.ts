import { auth } from '@/auth'
import { getAutopilotSettings, upsertAutopilotSettings } from '@/lib/db/queries/autopilot'
import { getVoiceProfile } from '@/lib/db/queries/voice'
import {
  PlanError,
  featureLockedBody,
  getUserPlan,
  limitFor,
  limitReachedBody,
  planErrorToResponse,
  planHasFeature,
} from '@/lib/plans'
import { AutopilotSettingsPatchSchema } from '@/lib/validators/autopilot'
import { apiError, invalidRequest, readJson, unauthorized } from '@/lib/validators/http'
import { DEFAULT_POST_DAYS, effectivePostDays, upcomingSlots } from '@/lib/autopilot/slots'
import type { AutopilotSettings } from '@/types/autopilot'

export const dynamic = 'force-dynamic'

function nextSlots(settings: AutopilotSettings, now = new Date()): string[] {
  return upcomingSlots(settings, now, { count: 5 }).map((d) => d.toISOString())
}

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const [settings, plan] = await Promise.all([getAutopilotSettings(userId), getUserPlan(userId)])
  return Response.json({ settings, nextSlots: nextSlots(settings), plan: { id: plan.id, status: plan.status } })
}

export async function PUT(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const parsed = AutopilotSettingsPatchSchema.safeParse(await readJson(req, {}))
  if (!parsed.success) return invalidRequest(parsed.error)
  const input = parsed.data

  try {
    const [plan, current] = await Promise.all([getUserPlan(userId), getAutopilotSettings(userId)])

    if (input.cadence && input.cadence !== 'ship_moments' && !planHasFeature(plan.id, 'autopilot.cadence')) {
      throw new PlanError(featureLockedBody('autopilot.cadence', plan.id))
    }
    if (input.approvalMode === 'auto' && !planHasFeature(plan.id, 'publish.auto_approve')) {
      throw new PlanError(featureLockedBody('publish.auto_approve', plan.id))
    }
    if (input.reviewerEmails && input.reviewerEmails.length > 0) {
      if (!planHasFeature(plan.id, 'team.reviewers')) {
        throw new PlanError(featureLockedBody('team.reviewers', plan.id))
      }
      const max = limitFor(plan.id, 'reviewers')
      const unique = Array.from(new Set(input.reviewerEmails))
      if (unique.length > max) {
        throw new PlanError(limitReachedBody('reviewers', unique.length, max, plan.id, 0))
      }
      input.reviewerEmails = unique
    }
    if (input.defaultVoiceProfileId) {
      const profile = await getVoiceProfile(input.defaultVoiceProfileId)
      if (!profile || profile.userId !== userId) return apiError(404, 'not_found', 'That voice profile was not found.')
    }

    const cadence = (input.cadence ?? current.cadence) as AutopilotSettings['cadence']
    let postDays = input.postDays
    if (postDays) postDays = effectivePostDays(cadence, postDays)
    else if (input.cadence && input.cadence !== current.cadence) postDays = [...DEFAULT_POST_DAYS[cadence]]

    const settings = await upsertAutopilotSettings(userId, {
      ...input,
      cadence,
      ...(postDays ? { postDays } : {}),
      triggers: input.triggers as AutopilotSettings['triggers'] | undefined,
      pausedUntil: input.pausedUntil === undefined ? undefined : input.pausedUntil ? input.pausedUntil.toISOString() : null,
    })
    return Response.json({ settings, nextSlots: nextSlots(settings) })
  } catch (err) {
    const res = planErrorToResponse(err)
    if (res) return res
    throw err
  }
}
