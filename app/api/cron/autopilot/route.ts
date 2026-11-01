import { cronAuthError } from '@/lib/autopilot/cron-auth'
import { runAutopilotCron } from '@/lib/autopilot/planner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Weekly digests, cadence fill, review reminders, trial emails and LinkedIn
 * expiry. Idempotent: safe to call every few minutes from any scheduler.
 */
async function handle(req: Request): Promise<Response> {
  const denied = cronAuthError(req)
  if (denied) return denied
  try {
    const result = await runAutopilotCron({ budgetMs: 50_000 })
    return Response.json(result)
  } catch (err) {
    console.error('[cron/autopilot] failed', err)
    return Response.json({ error: 'The autopilot run failed. Check the server logs.', code: 'internal_error' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
