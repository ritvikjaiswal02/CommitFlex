import { cronAuthError } from '@/lib/autopilot/cron-auth'
import { runPublishCron } from '@/lib/publish/cron'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Publishes every scheduled item whose time has come. Idempotent. */
async function handle(req: Request): Promise<Response> {
  const denied = cronAuthError(req)
  if (denied) return denied
  try {
    const result = await runPublishCron({ budgetMs: 50_000 })
    return Response.json(result)
  } catch (err) {
    console.error('[cron/publish] failed', err)
    return Response.json({ error: 'The publish run failed. Check the server logs.', code: 'internal_error' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
