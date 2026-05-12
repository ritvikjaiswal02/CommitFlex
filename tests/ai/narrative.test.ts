import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as provider from '@/lib/ai/provider'

vi.mock('@/lib/ai/provider', () => ({
  getGeminiClient: vi.fn(),
  aiCircuitBreaker: { call: vi.fn((fn: () => Promise<unknown>) => fn()) },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => 'Prompt {{tone}} {{technicalLevel}} {{audience}} {{summaries}} {{narrative}}') }
})

const mockGenerate = vi.fn()
const voice = { tone: 'professional', technicalLevel: 7, audience: 'engineers' }

beforeEach(() => {
  vi.mocked(provider.getGeminiClient).mockReturnValue({
    getGenerativeModel: () => ({ generateContent: mockGenerate }),
  } as any)
})

function makeResponse(text: string, promptTokens = 0, completionTokens = 0) {
  return {
    response: {
      text: () => text,
      usageMetadata: { promptTokenCount: promptTokens, candidatesTokenCount: completionTokens },
    },
  }
}

describe('extractNarrative', () => {
  it('parses narrative from AI response', async () => {
    mockGenerate.mockResolvedValue(makeResponse(
      JSON.stringify({
        theme: 'Performance sprint',
        story: 'We made things faster.',
        keyPoints: ['Cut latency by 40%', 'Removed N+1 queries'],
        technicalDepth: 8,
      }),
      200, 100,
    ))

    const { extractNarrative } = await import('@/lib/ai/narrative')
    const result = await extractNarrative(
      [{ sha: 'abc', summary: 'Optimized DB', tags: ['performance'], significance: 9 }],
      voice as any,
    )

    expect(result.narrative.theme).toBe('Performance sprint')
    expect(result.narrative.keyPoints).toHaveLength(2)
    expect(result._meta.promptTokens).toBe(200)
  })

  it('throws when AI returns no JSON object', async () => {
    mockGenerate.mockResolvedValue(makeResponse('Sorry, I cannot help.', 10, 5))

    const { extractNarrative } = await import('@/lib/ai/narrative')
    await expect(extractNarrative([], voice as any)).rejects.toThrow('No JSON object found')
  })
})

describe('generatePosts', () => {
  it('returns both posts on success', async () => {
    const linkedinPost = { content: 'Big week!', hashtags: ['#dev'], callToAction: 'What do you think?' }
    const twitterPost = { content: 'Shipped fast code.', hashtags: ['#coding'] }
    mockGenerate
      .mockResolvedValueOnce(makeResponse(JSON.stringify(linkedinPost), 50, 30))
      .mockResolvedValueOnce(makeResponse(JSON.stringify(twitterPost), 30, 20))

    const { generatePosts } = await import('@/lib/ai/posts')
    const narrative = { theme: 'Test', story: 'Story', keyPoints: ['p1'], technicalDepth: 5 }
    const result = await generatePosts(narrative, voice as any)

    expect(result.linkedin?.post.content).toBe('Big week!')
    expect(result.twitter?.post.content).toBe('Shipped fast code.')
    expect(Object.keys(result.errors)).toHaveLength(0)
  })

  it('returns partial result when one platform fails', async () => {
    const linkedinPost = { content: 'Big week!', hashtags: ['#dev'] }
    mockGenerate
      .mockResolvedValueOnce(makeResponse(JSON.stringify(linkedinPost), 50, 30))
      .mockRejectedValueOnce(new Error('Twitter API error'))

    const { generatePosts } = await import('@/lib/ai/posts')
    const narrative = { theme: 'Test', story: 'Story', keyPoints: ['p1'], technicalDepth: 5 }
    const result = await generatePosts(narrative, voice as any)

    expect(result.linkedin?.post.content).toBe('Big week!')
    expect(result.twitter).toBeNull()
    expect(result.errors.twitter).toBe('Twitter API error')
  })
})
