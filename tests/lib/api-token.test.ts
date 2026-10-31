import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import type { ApiTokenRow } from '@/lib/db/schema'

const q = vi.hoisted(() => ({ findActiveTokenByHash: vi.fn(), touchApiToken: vi.fn() }))
vi.mock('@/lib/db/queries/tokens', () => q)

import {
  API_TOKEN_PREFIX,
  apiTokenUnauthorized,
  authenticateApiToken,
  generateApiToken,
  hashApiToken,
  readBearerToken,
} from '@/lib/auth/api-token'

function tokenRow(overrides: Partial<ApiTokenRow> = {}): ApiTokenRow {
  return {
    id: 'tok-1', userId: 'u1', name: 'Chrome', tokenHash: 'h', tokenPrefix: 'cfx_abcdefgh', scopes: ['extension'],
    lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: new Date(), ...overrides,
  }
}

const req = (auth?: string) => new Request('https://app.test/api/extension/whoami', { headers: auth ? { Authorization: auth } : {} })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateApiToken', () => {
  it('creates cfx_ tokens with a sha256 hash and a 12-char prefix', () => {
    const { token, hash, prefix } = generateApiToken()
    expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true)
    expect(token).toMatch(/^cfx_[A-Za-z0-9_-]{43}$/)
    expect(prefix).toBe(token.slice(0, 12))
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(hashApiToken(token)).toBe(hash)
    expect(generateApiToken().token).not.toBe(token)
  })
})

describe('readBearerToken', () => {
  it('accepts only well-formed bearer tokens', () => {
    const { token } = generateApiToken()
    expect(readBearerToken(req(`Bearer ${token}`))).toBe(token)
    expect(readBearerToken(req(`bearer ${token}`))).toBe(token)
    expect(readBearerToken(req(token))).toBeNull()
    expect(readBearerToken(req('Bearer cfx_short'))).toBeNull()
    expect(readBearerToken(req('Bearer ghp_' + 'a'.repeat(43)))).toBeNull()
    expect(readBearerToken(req())).toBeNull()
  })
})

describe('authenticateApiToken', () => {
  it('returns the context for an active token and touches last_used_at', async () => {
    const { token, hash } = generateApiToken()
    q.findActiveTokenByHash.mockResolvedValue(tokenRow())
    const ctx = await authenticateApiToken(req(`Bearer ${token}`), 'extension')
    expect(ctx).toEqual({ userId: 'u1', tokenId: 'tok-1', scopes: ['extension'] })
    expect(q.findActiveTokenByHash).toHaveBeenCalledWith(hash)
    expect(q.touchApiToken).toHaveBeenCalledWith('tok-1')
  })

  it('does not touch a token used within the last minute', async () => {
    const { token } = generateApiToken()
    q.findActiveTokenByHash.mockResolvedValue(tokenRow({ lastUsedAt: new Date(Date.now() - 10_000) }))
    await authenticateApiToken(req(`Bearer ${token}`))
    expect(q.touchApiToken).not.toHaveBeenCalled()
  })

  it('still authenticates when the touch fails', async () => {
    const { token } = generateApiToken()
    q.findActiveTokenByHash.mockResolvedValue(tokenRow())
    q.touchApiToken.mockRejectedValue(new Error('db'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await authenticateApiToken(req(`Bearer ${token}`))).not.toBeNull()
    warn.mockRestore()
  })

  it('rejects unknown tokens, missing headers and missing scopes', async () => {
    const { token } = generateApiToken()
    q.findActiveTokenByHash.mockResolvedValue(null)
    expect(await authenticateApiToken(req(`Bearer ${token}`))).toBeNull()
    expect(await authenticateApiToken(req())).toBeNull()
    expect(q.findActiveTokenByHash).toHaveBeenCalledTimes(1)

    q.findActiveTokenByHash.mockResolvedValue(tokenRow({ scopes: ['read'] }))
    expect(await authenticateApiToken(req(`Bearer ${token}`), 'extension')).toBeNull()
  })
})

describe('apiTokenUnauthorized', () => {
  it('returns the contract 401 body with CORS headers', async () => {
    const res = apiTokenUnauthorized()
    expect(res.status).toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await res.json()).toEqual({ error: 'Invalid or missing extension token', code: 'unauthorized' })
  })
})
