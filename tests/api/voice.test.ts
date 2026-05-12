import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { getVoiceSettings, upsertVoiceSettings } from '@/lib/db/queries/voice'
import { GET, PUT } from '@/app/api/voice/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/voice', () => ({
  getVoiceSettings: vi.fn(),
  upsertVoiceSettings: vi.fn(),
}))

const mockSettings = {
  userId: 'user-1',
  tone: 'professional',
  technicalLevel: 5,
  audience: 'developers',
  extraContext: null,
}

const validBody = {
  tone: 'casual',
  technicalLevel: 3,
  audience: 'founders',
  extraContext: 'Focus on business impact',
}

function makePutRequest(body: unknown) {
  return new Request('http://localhost/api/voice', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getVoiceSettings).mockResolvedValue(mockSettings as any)
  vi.mocked(upsertVoiceSettings).mockResolvedValue({ ...mockSettings, ...validBody } as any)
})

describe('GET /api/voice', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns voice settings', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.settings.tone).toBe('professional')
    expect(getVoiceSettings).toHaveBeenCalledWith('user-1')
  })
})

describe('PUT /api/voice', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await PUT(makePutRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PUT(makePutRequest({ tone: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when technicalLevel is out of range', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PUT(makePutRequest({ ...validBody, technicalLevel: 11 }))
    expect(res.status).toBe(400)
  })

  it('upserts and returns settings', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PUT(makePutRequest(validBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.settings).toBeTruthy()
    expect(upsertVoiceSettings).toHaveBeenCalledWith('user-1', validBody)
  })

  it('accepts optional extraContext', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PUT(makePutRequest({ tone: 'professional', technicalLevel: 7, audience: 'engineers' }))
    expect(res.status).toBe(200)
  })
})
