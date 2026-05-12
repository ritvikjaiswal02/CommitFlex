import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { appendDraftVariants } from '@/lib/db/queries/drafts'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { getNarrativeByJob } from '@/lib/db/queries/narratives'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { generatePost } from '@/lib/ai/posts'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from '@/app/api/drafts/[draftId]/variants/route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/queries/drafts', () => ({
  appendDraftVariants: vi.fn(),
  getDraft: vi.fn(),
  hashContent: vi.fn(),
}))
vi.mock('@/lib/auth/require-owner', () => ({
  requireDraftOwner: vi.fn(),
  ownershipErrorToResponse: vi.fn().mockReturnValue(null),
}))
vi.mock('@/lib/db/queries/narratives', () => ({ getNarrativeByJob: vi.fn() }))
vi.mock('@/lib/db/queries/voice', () => ({ getVoiceSettings: vi.fn() }))
vi.mock('@/lib/ai/posts', () => ({
  generatePost: vi.fn(),
  creativityToTemperature: vi.fn((c: number) => 0.3 + (c / 100) * 0.7),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

const DRAFT_ID = 'draft-uuid-abcd'
const existingDraft = { id: DRAFT_ID, userId: 'user-1', jobId: 'job-uuid-1234', platform: 'linkedin' }
const narrativeRow = {
  id: 'n1', jobId: 'job-uuid-1234',
  story: 'A story', angle: 'Theme', targetAudience: '7',
  keyInsights: ['p1', 'p2'], suggestedHook: 'A',
}

function makeParams() { return { params: { draftId: DRAFT_ID } } }
function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/drafts/${DRAFT_ID}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 } as any)
  vi.mocked(ownershipErrorToResponse).mockReturnValue(null)
  vi.mocked(requireDraftOwner).mockResolvedValue(existingDraft as any)
  vi.mocked(getNarrativeByJob).mockResolvedValue(narrativeRow as any)
  vi.mocked(getVoiceSettings).mockResolvedValue({ tone: 'professional', technicalLevel: 7, audience: 'devs' } as any)
  vi.mocked(generatePost).mockResolvedValue({
    post: { content: 'a variant', hashtags: ['#dev'] },
    _meta: { promptTokens: 1, completionTokens: 1, promptVersion: '1.1', rawOutput: '{}', temperature: 0.7 },
  } as any)
  vi.mocked(appendDraftVariants).mockResolvedValue([
    { id: 'v1', sequenceNumber: 2, originalContent: 'a' },
    { id: 'v2', sequenceNumber: 3, originalContent: 'b' },
    { id: 'v3', sequenceNumber: 4, originalContent: 'c' },
  ] as any)
})

describe('POST /api/drafts/[draftId]/variants', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await POST(makeRequest({}), makeParams())
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 } as any)
    const res = await POST(makeRequest({}), makeParams())
    expect(res.status).toBe(429)
  })

  it('uses defaults (50/50/50, count=3) when body is empty', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makeRequest({}), makeParams())
    expect(res.status).toBe(201)
    expect(generatePost).toHaveBeenCalledTimes(3)
    const firstCallOpts = vi.mocked(generatePost).mock.calls[0][3]
    expect(firstCallOpts?.toneOverrides?.technical).toBe(50)
    expect(firstCallOpts?.toneOverrides?.engagement).toBe(50)
  })

  it('rejects out-of-range slider values', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makeRequest({ technical: 999 }), makeParams())
    expect(res.status).toBe(400)
  })

  it('returns 404 when narrative is missing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(getNarrativeByJob).mockResolvedValue(null as any)
    const res = await POST(makeRequest({}), makeParams())
    expect(res.status).toBe(404)
  })

  it('spreads creativity around the requested value across variants', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await POST(makeRequest({ creativity: 50, count: 3 }), makeParams())
    const calls = vi.mocked(generatePost).mock.calls
    const creativities = calls.map(c => c[3]?.toneOverrides?.creativity).filter((c): c is number => typeof c === 'number')
    expect(creativities).toHaveLength(3)
    // First should be lower, last should be higher around the mid value.
    expect(creativities[0]).toBeLessThan(creativities[2])
  })

  it('returns 502 if every variant call fails', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(generatePost).mockRejectedValue(new Error('LLM down'))
    const res = await POST(makeRequest({}), makeParams())
    expect(res.status).toBe(502)
  })

  it('persists the variants via appendDraftVariants', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await POST(makeRequest({}), makeParams())
    expect(appendDraftVariants).toHaveBeenCalledWith(
      'job-uuid-1234',
      'user-1',
      'linkedin',
      expect.arrayContaining([
        expect.objectContaining({ content: 'a variant', hashtags: ['#dev'] }),
      ]),
    )
  })

  it('returns 201 with the new drafts and meta payload', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await POST(makeRequest({ technical: 70, engagement: 40, creativity: 80 }), makeParams())
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.drafts).toHaveLength(3)
    expect(data.meta.requested).toBe(3)
    expect(data.meta.generated).toBe(3)
    expect(data.meta.sliders).toEqual({ technical: 70, engagement: 40, creativity: 80 })
  })

  it('honors a custom count', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    await POST(makeRequest({ count: 5 }), makeParams())
    expect(generatePost).toHaveBeenCalledTimes(5)
  })
})
