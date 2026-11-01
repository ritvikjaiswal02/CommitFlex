import { randomBytes } from 'crypto'
import { auth } from '@/auth'
import { appUrl, isConfigured } from '@/lib/env'
import {
  LINKEDIN_STATE_COOKIE,
  buildLinkedInAuthorizeUrl,
  encodeStateCookie,
  safeReturnTo,
} from '@/lib/publish/linkedin'
import { redirect, serializeCookie } from '@/lib/publish/cookies'
import { apiError } from '@/lib/validators/http'

export const dynamic = 'force-dynamic'

/** Starts LinkedIn OAuth. `returnTo` (a same-origin path) is where the user lands afterwards. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))

  const session = await auth()
  if (!session?.user?.id) {
    const next = `/api/integrations/linkedin/connect?returnTo=${encodeURIComponent(returnTo)}`
    return redirect(`${appUrl()}/login?next=${encodeURIComponent(next)}`)
  }

  if (!isConfigured('linkedin')) {
    return apiError(503, 'not_configured', 'LinkedIn publishing is not available on this server yet.')
  }

  const state = randomBytes(24).toString('base64url')
  const cookie = serializeCookie(LINKEDIN_STATE_COOKIE, encodeStateCookie({ state, returnTo }), {
    maxAge: 600,
    path: '/api/integrations/linkedin',
    secure: appUrl().startsWith('https://'),
  })
  return redirect(buildLinkedInAuthorizeUrl(state), cookie)
}
