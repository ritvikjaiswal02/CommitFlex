import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { analyzeVoiceSamples } from '@/lib/ai/voice-analyzer'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from '@/app/api/voice/analyze/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ai/voice-analyzer', () => ({ analyzeVoiceSamples: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

const goodSample = 'A'.repeat(60)
const validBody = { samples: [goodSample, goodSample, goodSample] }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/voice/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 } as any)
  vi.mocked(analyzeVoiceSamples).mockResolvedValue({
    fingerprint: 'Voice fingerprint: punchy and direct.',
    _meta: { promptTokens: 100, completionTokens: 50, promptVersion: '1.0', rawOutput: '' },
  } as any)
})

describe('POST /api/voice/analyze', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 } as any)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(429)
  })

  it('returns 400 when fewer than 3 samples', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makeRequest({ samples: [goodSample, goodSample] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a sample is too short', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makeRequest({ samples: ['short', goodSample, goodSample] }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with fingerprint on success', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.fingerprint).toBe('Voice fingerprint: punchy and direct.')
  })

  it('passes only the validated samples to the analyzer', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await POST(makeRequest(validBody))
    expect(analyzeVoiceSamples).toHaveBeenCalledWith(validBody.samples)
  })

  it('returns 502 when the analyzer throws', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(analyzeVoiceSamples).mockRejectedValue(new Error('LLM blew up'))
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toContain('LLM blew up')
  })

  it('rate-limit key is scoped per user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-xyz' } } as any)
    await POST(makeRequest(validBody))
    const key = vi.mocked(checkRateLimit).mock.calls[0][0]
    expect(key).toContain('user-xyz')
    expect(key).toContain('voice-analyze')
  })
})
