import { getSessionUser, jsonError, unauthorized } from '../_lib/http'
import { buildBillingStatus } from '../_lib/status'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/billing/status: effective plan, usage against every limit, and checkout availability. */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  try {
    const status = await buildBillingStatus(user.id, req.headers)
    return Response.json(status, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[billing] status failed', err)
    return jsonError(500, 'internal_error', "We couldn't load your billing details. Refresh to try again.")
  }
}
