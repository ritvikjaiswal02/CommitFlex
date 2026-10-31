/**
 * Plan limits enforced at run time. enforcePlanLimits() only runs on billing
 * events, and a subscription that simply lapses sends none, so every
 * autopilot path re-checks here: only the oldest N autopilot repos (N = the
 * plan's repo limit) are acted on, matching what enforcePlanLimits keeps.
 */
import { getUserPlan, limitFor, type Plan } from '@/lib/plans'
import { listAutopilotRepos } from '@/lib/db/queries/billing'

/** Ids of the autopilot repos the user's current plan covers, oldest first. */
export async function allowedAutopilotRepoIds(userId: string, plan?: Plan): Promise<Set<string>> {
  const [effective, repos] = await Promise.all([plan ? Promise.resolve(plan) : getUserPlan(userId), listAutopilotRepos(userId)])
  const max = limitFor(effective.id, 'repos')
  return new Set(repos.slice(0, Number.isFinite(max) ? max : repos.length).map((r) => r.id))
}

export async function isRepoWithinPlan(userId: string, repoId: string): Promise<boolean> {
  try {
    return (await allowedAutopilotRepoIds(userId)).has(repoId)
  } catch (err) {
    // Fail open: a lookup error must not silently stop a paying user's autopilot.
    console.error('[limits] repo plan check failed', err)
    return true
  }
}
