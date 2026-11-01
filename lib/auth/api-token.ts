/**
 * Personal access tokens for the Chrome extension.
 *
 * Format: 'cfx_' + base64url(32 random bytes). Only the SHA-256 hex digest is
 * stored, plus a 12-character prefix ('cfx_' + 8) so users can tell tokens apart.
 * Token-authenticated routes never read cookies.
 */
import { createHash, randomBytes } from 'crypto'

export const API_TOKEN_PREFIX = 'cfx_'

/** Matches a well-formed token: prefix + 43 base64url chars (32 bytes, unpadded). */
const TOKEN_PATTERN = /^cfx_[A-Za-z0-9_-]{43}$/

/** Only touch last_used_at once a minute per token to avoid a write per request. */
const TOUCH_INTERVAL_MS = 60_000

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateApiToken(): { token: string; hash: string; prefix: string } {
  const token = API_TOKEN_PREFIX + randomBytes(32).toString('base64url')
  return { token, hash: hashApiToken(token), prefix: token.slice(0, 12) }
}

export function isWellFormedApiToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

/** Reads `Authorization: Bearer cfx_…`. Returns null when absent or malformed. */
export function readBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match) return null
  const token = match[1]
  return isWellFormedApiToken(token) ? token : null
}

export interface ApiTokenContext {
  userId: string
  tokenId: string
  scopes: string[]
}

/**
 * Authenticates a token request. Returns null when the header is missing or
 * malformed, the token is unknown, revoked or expired, or it lacks the scope.
 */
export async function authenticateApiToken(req: Request, requiredScope?: string): Promise<ApiTokenContext | null> {
  const token = readBearerToken(req)
  if (!token) return null

  // Imported lazily so this module stays cheap to import (and testable) and
  // never pulls the database into code that only needs hashing.
  const { findActiveTokenByHash, touchApiToken } = await import('@/lib/db/queries/tokens')
  const row = await findActiveTokenByHash(hashApiToken(token))
  if (!row) return null
  if (requiredScope && !row.scopes.includes(requiredScope)) return null

  const lastUsed = row.lastUsedAt?.getTime() ?? 0
  if (Date.now() - lastUsed > TOUCH_INTERVAL_MS) {
    try {
      await touchApiToken(row.id)
    } catch (err) {
      console.warn('[api-token] failed to update last_used_at', err)
    }
  }

  return { userId: row.userId, tokenId: row.id, scopes: row.scopes }
}

/** CORS headers for token routes (the extension calls from its own origin). */
export const API_TOKEN_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export function apiTokenUnauthorized(): Response {
  return Response.json(
    { error: 'Invalid or missing extension token', code: 'unauthorized' },
    { status: 401, headers: API_TOKEN_CORS_HEADERS },
  )
}
