/**
 * LinkedIn: OAuth 2.0 (OpenID Connect + "Share on LinkedIn") and the Posts API.
 *
 * Scopes: openid profile email w_member_social. Normal apps get a 60-day
 * access token and no refresh token, so the autopilot cron emails a reconnect
 * reminder before it expires (PRODUCT_SPEC flow K).
 */
import { appUrl, linkedInApiVersion, requireEnv } from '@/lib/env'

export const LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social'] as const
export const LINKEDIN_STATE_COOKIE = 'cf_li_state'
export const LINKEDIN_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization'
export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
export const LINKEDIN_REVOKE_URL = 'https://www.linkedin.com/oauth/v2/revoke'
export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'
export const LINKEDIN_POSTS_URL = 'https://api.linkedin.com/rest/posts'

export class LinkedInApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'LinkedInApiError'
  }
  /** The token is invalid, expired or revoked: the user must reconnect. */
  get isAuthError(): boolean {
    return this.status === 401
  }
}

export function linkedInRedirectUri(): string {
  return `${appUrl()}/api/integrations/linkedin/callback`
}

export function buildLinkedInAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('LINKEDIN_CLIENT_ID'),
    redirect_uri: linkedInRedirectUri(),
    state,
    scope: LINKEDIN_SCOPES.join(' '),
  })
  return `${LINKEDIN_AUTHORIZE_URL}?${params.toString()}`
}

/** Only same-origin relative paths are allowed as a post-connect destination. */
export function safeReturnTo(value: string | null | undefined, fallback = '/settings?tab=connections'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value.slice(0, 500)
}

export function encodeStateCookie(payload: { state: string; returnTo: string }): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeStateCookie(value: string | null | undefined): { state: string; returnTo: string } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { state?: unknown; returnTo?: unknown }
    if (typeof parsed.state !== 'string' || parsed.state.length < 16) return null
    return { state: parsed.state, returnTo: safeReturnTo(typeof parsed.returnTo === 'string' ? parsed.returnTo : null) }
  } catch {
    return null
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const msg = b.message ?? b.error_description ?? b.error
    if (typeof msg === 'string' && msg) return msg
  }
  if (typeof body === 'string' && body) return body.slice(0, 300)
  return fallback
}

export interface LinkedInTokenResponse {
  accessToken: string
  expiresAt: Date | null
  refreshToken: string | null
  scopes: string[]
}

export async function exchangeLinkedInCode(code: string, fetchImpl: typeof fetch = fetch): Promise<LinkedInTokenResponse> {
  const res = await fetchImpl(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: linkedInRedirectUri(),
      client_id: requireEnv('LINKEDIN_CLIENT_ID'),
      client_secret: requireEnv('LINKEDIN_CLIENT_SECRET'),
    }).toString(),
    cache: 'no-store',
  })
  const body = (await readBody(res)) as Record<string, unknown> | null
  if (!res.ok || !body || typeof body.access_token !== 'string') {
    throw new LinkedInApiError(res.status, errorMessage(body, 'LinkedIn did not return an access token'), body)
  }
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null
  return {
    accessToken: body.access_token,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    scopes: typeof body.scope === 'string' ? body.scope.split(/[ ,]+/).filter(Boolean) : [...LINKEDIN_SCOPES],
  }
}

export interface LinkedInProfile {
  sub: string
  name: string | null
  email: string | null
  picture: string | null
}

export async function fetchLinkedInProfile(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<LinkedInProfile> {
  const res = await fetchImpl(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const body = (await readBody(res)) as Record<string, unknown> | null
  if (!res.ok || !body || typeof body.sub !== 'string') {
    throw new LinkedInApiError(res.status, errorMessage(body, 'Could not read the LinkedIn profile'), body)
  }
  const name =
    typeof body.name === 'string'
      ? body.name
      : [body.given_name, body.family_name].filter((p): p is string => typeof p === 'string').join(' ') || null
  return {
    sub: body.sub,
    name,
    email: typeof body.email === 'string' ? body.email : null,
    picture: typeof body.picture === 'string' ? body.picture : null,
  }
}

/** Best effort: tells LinkedIn to invalidate the token. Never throws. */
export async function revokeLinkedInToken(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(LINKEDIN_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: accessToken,
        client_id: requireEnv('LINKEDIN_CLIENT_ID'),
        client_secret: requireEnv('LINKEDIN_CLIENT_SECRET'),
      }).toString(),
      cache: 'no-store',
    })
  } catch (err) {
    console.warn('[linkedin] token revoke failed', err)
  }
}

/* ─── Little text ──────────────────────────────────────────────────────── */

const RESERVED = /[\\|{}@[\]()<>#*_~]/g

/** Escapes LinkedIn "little text" reserved characters with a backslash. */
export function escapeLittleText(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`)
}

/**
 * Converts post text into LinkedIn `commentary`: reserved characters are
 * escaped, and `#tag` hashtags become `{hashtag|\#|tag}` so they stay
 * clickable.
 */
export function toLinkedInCommentary(text: string): string {
  const parts: string[] = []
  const tagPattern = new RegExp('(^|[^\\p{L}\\p{N}_&])#([\\p{L}\\p{N}_]+)', 'gu')
  let last = 0
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(text)) !== null) {
    const [whole, lead, tag] = match
    const start = match.index
    parts.push(escapeLittleText(text.slice(last, start) + lead))
    parts.push(`{hashtag|\\#|${tag}}`)
    last = start + whole.length
  }
  parts.push(escapeLittleText(text.slice(last)))
  return parts.join('')
}

export interface LinkedInPostResult {
  urn: string
  url: string
}

export function linkedInPostUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`
}

/** Publishes a text post as the member. Throws LinkedInApiError. */
export async function createLinkedInPost(
  input: { accessToken: string; authorSub: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedInPostResult> {
  const res = await fetchImpl(LINKEDIN_POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': linkedInApiVersion(),
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${input.authorSub}`,
      commentary: toLinkedInCommentary(input.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await readBody(res)
    throw new LinkedInApiError(res.status, errorMessage(body, `LinkedIn returned ${res.status}`), body)
  }
  const urn = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id')
  if (!urn) throw new LinkedInApiError(502, 'LinkedIn accepted the post but returned no post id')
  return { urn, url: linkedInPostUrl(urn) }
}
