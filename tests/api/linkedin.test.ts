import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/integrations', () => ({
  upsertLinkedInConnection: vi.fn(),
  deleteLinkedInConnection: vi.fn(),
}))

import { auth } from '@/auth'
import { upsertLinkedInConnection } from '@/lib/db/queries/integrations'
import {
  LinkedInApiError,
  createLinkedInPost,
  decodeStateCookie,
  encodeStateCookie,
  escapeLittleText,
  safeReturnTo,
  toLinkedInCommentary,
} from '@/lib/publish/linkedin'
import { GET as connect } from '@/app/api/integrations/linkedin/connect/route'
import { GET as callback } from '@/app/api/integrations/linkedin/callback/route'

const ENV = {
  LINKEDIN_CLIENT_ID: 'client-id',
  LINKEDIN_CLIENT_SECRET: 'client-secret',
  OAUTH_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  APP_URL: 'https://app.commitflex.test',
}
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  vi.clearAllMocks()
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
})

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

describe('little text', () => {
  it('escapes reserved characters', () => {
    expect(escapeLittleText('a (b) [c] {d} <e> @f #g *h _i ~j |k \\l')).toBe(
      'a \\(b\\) \\[c\\] \\{d\\} \\<e\\> \\@f \\#g \\*h \\_i \\~j \\|k \\\\l',
    )
  })

  it('turns hashtags into hashtag templates and escapes the rest', () => {
    expect(toLinkedInCommentary('Shipped retries (finally).\n\n#webhooks #TypeScript')).toBe(
      'Shipped retries \\(finally\\).\n\n{hashtag|\\#|webhooks} {hashtag|\\#|TypeScript}',
    )
  })

  it('leaves a lone # and C# style text escaped, not tagged', () => {
    expect(toLinkedInCommentary('Issue # 4')).toBe('Issue \\# 4')
  })
})

describe('state cookie and returnTo', () => {
  it('round-trips the state payload', () => {
    const value = encodeStateCookie({ state: 's'.repeat(24), returnTo: '/onboarding' })
    expect(decodeStateCookie(value)).toEqual({ state: 's'.repeat(24), returnTo: '/onboarding' })
    expect(decodeStateCookie('garbage')).toBeNull()
  })

  it('only allows same-origin paths', () => {
    expect(safeReturnTo('/dashboard')).toBe('/dashboard')
    expect(safeReturnTo('https://evil.example')).toBe('/settings?tab=connections')
    expect(safeReturnTo('//evil.example')).toBe('/settings?tab=connections')
    expect(safeReturnTo(null)).toBe('/settings?tab=connections')
  })
})

describe('createLinkedInPost', () => {
  it('posts to the Posts API with the version headers and returns the URN', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } }),
    )
    const result = await createLinkedInPost({ accessToken: 'tok', authorSub: 'abc', text: 'Hello #dev' }, fetchImpl as any)
    expect(result).toEqual({ urn: 'urn:li:share:123', url: 'https://www.linkedin.com/feed/update/urn:li:share:123/' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.linkedin.com/rest/posts')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202510',
    })
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      author: 'urn:li:person:abc',
      commentary: 'Hello {hashtag|\\#|dev}',
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
    })
  })

  it('throws an auth error on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ message: 'Expired token' }, { status: 401 }))
    const err = await createLinkedInPost({ accessToken: 't', authorSub: 'a', text: 'x' }, fetchImpl as any).catch((e) => e)
    expect(err).toBeInstanceOf(LinkedInApiError)
    expect(err.isAuthError).toBe(true)
    expect(err.message).toBe('Expired token')
  })
})

describe('GET /api/integrations/linkedin/connect', () => {
  it('redirects to LinkedIn with scopes and sets the state cookie', async () => {
    const res = await connect(new Request('http://localhost/api/integrations/linkedin/connect?returnTo=/onboarding'))
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(location.searchParams.get('scope')).toBe('openid profile email w_member_social')
    expect(location.searchParams.get('redirect_uri')).toBe('https://app.commitflex.test/api/integrations/linkedin/callback')
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/^cf_li_state=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })

  it('returns 503 when LinkedIn is not configured', async () => {
    delete process.env.LINKEDIN_CLIENT_ID
    const res = await connect(new Request('http://localhost/api/integrations/linkedin/connect'))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('not_configured')
  })

  it('sends signed-out users to login', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await connect(new Request('http://localhost/api/integrations/linkedin/connect'))
    expect(res.headers.get('location')).toMatch(/\/login\?next=/)
  })
})

describe('GET /api/integrations/linkedin/callback', () => {
  function callbackRequest(query: string, state = 's'.repeat(32)) {
    const cookie = encodeStateCookie({ state, returnTo: '/onboarding' })
    return new Request(`http://localhost/api/integrations/linkedin/callback?${query}`, {
      headers: { cookie: `cf_li_state=${cookie}` },
    })
  }

  it('rejects a mismatched state', async () => {
    const res = await callback(callbackRequest(`code=abc&state=${'x'.repeat(32)}`))
    expect(res.headers.get('location')).toBe('https://app.commitflex.test/onboarding?linkedin=error')
    expect(upsertLinkedInConnection).not.toHaveBeenCalled()
  })

  it('reports a denied consent', async () => {
    const res = await callback(callbackRequest('error=user_cancelled_authorize'))
    expect(res.headers.get('location')).toBe('https://app.commitflex.test/onboarding?linkedin=denied')
  })

  it('exchanges the code, stores an encrypted token and redirects back', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('accessToken')) {
        return Response.json({ access_token: 'li-token', expires_in: 5184000, scope: 'openid,profile,email,w_member_social' })
      }
      return Response.json({ sub: 'member-1', name: 'Ada Lovelace', email: 'ada@example.com', picture: 'https://img' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const state = 'q'.repeat(32)
    const res = await callback(callbackRequest(`code=abc&state=${state}`, state))
    expect(res.headers.get('location')).toBe('https://app.commitflex.test/onboarding?linkedin=connected')
    expect(upsertLinkedInConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        providerAccountId: 'member-1',
        displayName: 'Ada Lovelace',
        scopes: ['openid', 'profile', 'email', 'w_member_social'],
      }),
    )
    const stored = vi.mocked(upsertLinkedInConnection).mock.calls[0][0]
    expect(stored.accessTokenEnc).not.toContain('li-token')
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/)
  })
})
