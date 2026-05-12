import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { getPrefs, upsertPrefs } from '@/lib/db/queries/notifications'
import { GET, PUT } from '@/app/api/notifications/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/notifications', () => ({
  getPrefs: vi.fn(),
  upsertPrefs: vi.fn(),
}))

const defaultPrefs = {
  userId: 'user-1',
  emailOnComplete: true,
  weeklyDigest: false,
  productUpdates: false,
  updatedAt: new Date('2026-01-01'),
}

function putReq(body: unknown) {
  return new Request('http://localhost/api/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPrefs).mockResolvedValue(defaultPrefs as any)
  vi.mocked(upsertPrefs).mockResolvedValue(defaultPrefs as any)
})

describe('GET /api/notifications', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns prefs for authenticated user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.prefs.emailOnComplete).toBe(true)
    expect(getPrefs).toHaveBeenCalledWith('user-1')
  })
})

describe('PUT /api/notifications', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await PUT(putReq({ emailOnComplete: false }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PUT(putReq({ emailOnComplete: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('accepts a partial patch', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PUT(putReq({ weeklyDigest: true }))
    expect(res.status).toBe(200)
    expect(upsertPrefs).toHaveBeenCalledWith('user-1', { weeklyDigest: true })
  })

  it('accepts an empty body (no-op)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PUT(putReq({}))
    expect(res.status).toBe(200)
    expect(upsertPrefs).toHaveBeenCalledWith('user-1', {})
  })
})
