import { appUrl } from '@/lib/env'
import { getUsage, getUserPlan } from '@/lib/plans'
import { getExtensionUser } from '../_lib/user'
import { corsError, corsJson, preflight, withExtensionToken } from '../_lib/http'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return preflight()
}

/**
 * GET /api/extension/whoami
 * Who the token belongs to, their plan and this month's draft usage.
 * The extension calls it to verify a token on connect and to fill the popup header.
 */
export async function GET(req: Request) {
  return withExtensionToken(req, 'whoami', async ({ userId, tokenId }) => {
    const user = await getExtensionUser(userId)
    if (!user) return corsError(401, 'unauthorized', 'Invalid or missing extension token')

    const plan = await getUserPlan(userId)
    const usage = await getUsage(userId, plan)
    const generations = usage.items.generationsPerMonth
    const queued = usage.items.queuedPosts

    return corsJson({
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
      plan: {
        id: plan.id,
        name: plan.definition.name,
        status: plan.status,
        trialEndsAt: plan.trialEndsAt ? plan.trialEndsAt.toISOString() : null,
      },
      usage: {
        generations: { used: generations.used, max: generations.max },
        queuedPosts: { used: queued.used, max: queued.max },
      },
      token: { id: tokenId },
      appUrl: appUrl(),
    })
  })
}
