import { createHash, timingSafeEqual } from 'crypto'
import { isProduction, optionalEnv } from '@/lib/env'

/**
 * Cron routes accept `Authorization: Bearer $CRON_SECRET` (what Vercel Cron
 * sends; external schedulers send the same header). Returns a Response to
 * send back when the request is not allowed, or null when it is.
 *
 * Without CRON_SECRET: 503 in production, open in development so the
 * endpoints can be exercised locally.
 */
export function cronAuthError(req: Request): Response | null {
  const secret = optionalEnv('CRON_SECRET')
  if (!secret) {
    if (isProduction()) {
      return Response.json({ error: 'CRON_SECRET is not set on this deployment.', code: 'not_configured' }, { status: 503 })
    }
    return null
  }
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return Response.json({ error: 'Missing cron secret.', code: 'unauthorized' }, { status: 401 })
  // Compare digests so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(match[1]).digest()
  const b = createHash('sha256').update(secret).digest()
  if (!timingSafeEqual(a, b)) return Response.json({ error: 'Invalid cron secret.', code: 'unauthorized' }, { status: 401 })
  return null
}
