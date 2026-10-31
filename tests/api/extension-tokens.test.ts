import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'

vi.mock('@/auth', () => ({ auth: vi.fn() }))

const plans = vi.hoisted(() => {
  class PlanError extends Error {
    readonly status = 402 as const
    constructor(public body: Record<string, unknown>) {
      super(String(body.error))
      this.name = 'PlanError'
    }
  }
  return {
    PlanError,
    getUserPlan: vi.fn(),
    assertWithinLimit: vi.fn(),
    limitFor: vi.fn(),
    planErrorToResponse: vi.fn((err: unknown) =>
      err instanceof PlanError ? Response.json(err.body, { status: 402 }) : null,
    ),
  }
})
vi.mock('@/lib/plans', () => plans)

const tokens = vi.hoisted(() => ({ createApiToken: vi.fn(), listApiTokens: vi.fn(), revokeApiToken: vi.fn() }))
vi.mock('@/lib/db/queries/tokens', () => tokens)

import { GET, POST } from '@/app/api/extension/tokens/route'
import { DELETE } from '@/app/api/extension/tokens/[tokenId]/route'
import { defaultTokenName } from '@/app/api/extension/_lib/token-name'

const USER = 'user-1'
const TOKEN_ID = '5b7f0b7e-1c2d-4e3f-8a9b-0c1d2e3f4a5b'

const summary = {
  id: TOKEN_ID, name: 'Chrome on 1 Nov 2026', tokenPrefix: 'cfx_abcdefgh', scopes: ['extension'],
  lastUsedAt: null, createdAt: '2026-11-01T10:00:00.000Z', expiresAt: null,
}

const postRequest = (body?: unknown) =>
  new Request('https://app.test/api/extension/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: USER } } as any)
  plans.getUserPlan.mockResolvedValue({ id: 'free', definition: { name: 'Free' }, status: 'free' })
  plans.limitFor.mockReturnValue(2)
  plans.assertWithinLimit.mockResolvedValue({ used: 0, max: 2 })
  tokens.createApiToken.mockResolvedValue({ token: 'cfx_secret', summary })
  tokens.listApiTokens.mockResolvedValue([summary])
  tokens.revokeApiToken.mockResolvedValue(true)
})

describe('GET /api/extension/tokens', () => {
  it('requires a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('lists tokens with the plan limit', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ tokens: [summary], limit: { used: 1, max: 2 } })
    expect(plans.limitFor).toHaveBeenCalledWith('free', 'extensionTokens')
  })
})

describe('POST /api/extension/tokens', () => {
  it('requires a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(postRequest({}))
    expect(res.status).toBe(401)
    expect(tokens.createApiToken).not.toHaveBeenCalled()
  })

  it('creates a token with the default name and returns it once', async () => {
    const res = await POST(postRequest())
    expect(res.status).toBe(201)
    expect(plans.assertWithinLimit).toHaveBeenCalledWith(USER, 'extensionTokens')
    expect(tokens.createApiToken).toHaveBeenCalledWith(USER, expect.stringMatching(/^Chrome on /), ['extension'])
    expect(await res.json()).toEqual({ token: 'cfx_secret', summary })
  })

  it('uses a custom name', async () => {
    await POST(postRequest({ name: '  Work laptop ' }))
    expect(tokens.createApiToken).toHaveBeenCalledWith(USER, 'Work laptop', ['extension'])
  })

  it('rejects names over 60 characters and malformed JSON', async () => {
    expect((await POST(postRequest({ name: 'x'.repeat(61) }))).status).toBe(400)
    expect((await POST(postRequest('{not json'))).status).toBe(400)
    expect(tokens.createApiToken).not.toHaveBeenCalled()
  })

  it('returns 402 limit_reached when the plan limit is used up', async () => {
    const body = { error: "You've used 2 of 2 extension tokens.", code: 'limit_reached', limit: 'extensionTokens', used: 2, max: 2, requiredPlan: 'pro', currentPlan: 'free' }
    plans.assertWithinLimit.mockRejectedValue(new plans.PlanError(body))
    const res = await POST(postRequest({}))
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual(body)
    expect(tokens.createApiToken).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/extension/tokens/:tokenId', () => {
  const del = (tokenId = TOKEN_ID) =>
    DELETE(new Request(`https://app.test/api/extension/tokens/${tokenId}`, { method: 'DELETE' }), { params: { tokenId } })

  it('requires a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    expect((await del()).status).toBe(401)
  })

  it('revokes the token for the signed-in user', async () => {
    const res = await del()
    expect(res.status).toBe(204)
    expect(tokens.revokeApiToken).toHaveBeenCalledWith(USER, TOKEN_ID)
  })

  it('returns 404 when the token is unknown or not theirs', async () => {
    tokens.revokeApiToken.mockResolvedValue(false)
    expect((await del()).status).toBe(404)
  })

  it('returns 404 for a malformed id without querying', async () => {
    expect((await del('../../etc')).status).toBe(404)
    expect(tokens.revokeApiToken).not.toHaveBeenCalled()
  })
})

describe('defaultTokenName', () => {
  it('formats the UTC date', () => {
    expect(defaultTokenName(new Date('2026-11-01T23:30:00.000Z'))).toBe('Chrome on 1 Nov 2026')
  })
})
