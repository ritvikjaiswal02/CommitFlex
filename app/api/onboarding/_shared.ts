import type { PlanId } from '@/lib/billing/catalog'
import { planHasFeature } from '@/lib/billing/catalog'
import type { AutopilotCadence, ApprovalMode } from '@/types/autopilot'

export function unauthorized(): Response {
  return Response.json({ error: 'Sign in to continue', code: 'unauthorized' }, { status: 401 })
}

export function invalidRequest(issues: unknown, error = 'Some answers need another look'): Response {
  return Response.json({ error, code: 'invalid_request', issues }, { status: 400 })
}

export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null)
}

/**
 * Autopilot choices the plan can't use fall back to what it can, instead of
 * failing onboarding: a non-ship-moment cadence needs `autopilot.cadence`,
 * auto approval needs `publish.auto_approve`. During the trial (Pro) both pass.
 */
export function coerceAutopilotChoices<
  T extends { cadence?: AutopilotCadence; approvalMode?: ApprovalMode },
>(planId: PlanId, choices: T): T & { downgraded: ('cadence' | 'approvalMode')[] } {
  const downgraded: ('cadence' | 'approvalMode')[] = []
  const next = { ...choices }
  if (next.cadence && next.cadence !== 'ship_moments' && !planHasFeature(planId, 'autopilot.cadence')) {
    next.cadence = 'ship_moments'
    downgraded.push('cadence')
  }
  if (next.approvalMode === 'auto' && !planHasFeature(planId, 'publish.auto_approve')) {
    next.approvalMode = 'review'
    downgraded.push('approvalMode')
  }
  return { ...next, downgraded }
}
