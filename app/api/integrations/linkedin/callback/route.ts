import { timingSafeEqual } from 'crypto'
import { auth } from '@/auth'
import { appUrl, isConfigured } from '@/lib/env'
import { encrypt } from '@/lib/auth/encrypt'
import { upsertLinkedInConnection } from '@/lib/db/queries/integrations'
import {
  LINKEDIN_STATE_COOKIE,
  decodeStateCookie,
  exchangeLinkedInCode,
  fetchLinkedInProfile,
  safeReturnTo,
} from '@/lib/publish/linkedin'
import { readCookie, redirect, serializeCookie } from '@/lib/publish/cookies'

export const dynamic = 'force-dynamic'

type Result = 'connected' | 'denied' | 'error'

function back(returnTo: string, result: Result): Response {
  const target = new URL(returnTo, appUrl())
  target.searchParams.set('linkedin', result)
  const clear = serializeCookie(LINKEDIN_STATE_COOKIE, '', { maxAge: 0, path: '/api/integrations/linkedin' })
  return redirect(target.toString(), clear)
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const cookie = decodeStateCookie(readCookie(req, LINKEDIN_STATE_COOKIE))
  const returnTo = cookie?.returnTo ?? safeReturnTo(null)

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return redirect(`${appUrl()}/login?next=${encodeURIComponent(returnTo)}`)

  if (url.searchParams.get('error')) {
    // user_cancelled_login / user_cancelled_authorize and friends.
    return back(returnTo, 'denied')
  }

  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (!cookie || !state || !code || !sameState(cookie.state, state) || !isConfigured('linkedin')) {
    return back(returnTo, 'error')
  }

  try {
    const token = await exchangeLinkedInCode(code)
    const profile = await fetchLinkedInProfile(token.accessToken)
    await upsertLinkedInConnection({
      userId,
      providerAccountId: profile.sub,
      displayName: profile.name,
      email: profile.email,
      avatarUrl: profile.picture,
      accessTokenEnc: encrypt(token.accessToken),
      refreshTokenEnc: token.refreshToken ? encrypt(token.refreshToken) : null,
      expiresAt: token.expiresAt,
      scopes: token.scopes,
    })
    return back(returnTo, 'connected')
  } catch (err) {
    console.error('[linkedin] callback failed', err)
    return back(returnTo, 'error')
  }
}
