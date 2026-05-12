import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as provider from '@/lib/ai/provider'

vi.mock('@/lib/ai/provider', () => ({
  getGeminiClient: vi.fn(),
  aiCircuitBreaker: { call: vi.fn((fn: () => Promise<unknown>) => fn()) },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => 'You are an AI. Commits:\n{{commits}}') }
})

const mockGenerate = vi.fn()

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

describe('summarizeCommits', () => {
  it('returns empty summaries for empty commits array', async () => {
    const { summarizeCommits } = await import('@/lib/ai/summarize')
    const result = await summarizeCommits([])
    expect(result.summaries).toHaveLength(0)
    expect(result._meta.promptTokens).toBe(0)
  })

  it('parses AI JSON response into summaries', async () => {
    mockGenerate.mockResolvedValue(makeResponse(
      JSON.stringify([{ sha: 'abc', summary: 'Fixed a bug', tags: ['bug-fix'], significance: 6 }]),
      100, 50,
    ))

    const { summarizeCommits } = await import('@/lib/ai/summarize')
    const result = await summarizeCommits([{
      sha: 'abc', message: 'fix: bug', author: 'Alice',
      date: '2026-01-01T00:00:00Z', url: 'https://github.com/a/b/commit/abc',
    }])

    expect(result.summaries).toHaveLength(1)
    expect(result.summaries[0].sha).toBe('abc')
    expect(result.summaries[0].significance).toBe(6)
    expect(result._meta.promptTokens).toBe(100)
    expect(result._meta.promptVersion).toBe('1.0')
  })

  it('extracts JSON array embedded in prose', async () => {
    mockGenerate.mockResolvedValue(makeResponse(
      'Here is the result:\n[{"sha":"xyz","summary":"Added feature","tags":["feature"],"significance":8}]',
      80, 40,
    ))

    const { summarizeCommits } = await import('@/lib/ai/summarize')
    const result = await summarizeCommits([{
      sha: 'xyz', message: 'feat: new thing', author: 'Bob',
      date: '2026-01-01T00:00:00Z', url: 'https://github.com/a/b/commit/xyz',
    }])

    expect(result.summaries[0].sha).toBe('xyz')
  })
})
