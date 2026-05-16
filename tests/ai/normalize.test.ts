import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  normalizeCommitSummary,
  normalizeNarrative,
  normalizeGeneratedPost,
} from '@/lib/ai/normalize'

describe('normalizeText', () => {
  it('trims whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
  })

  it('collapses triple newlines to double', () => {
    expect(normalizeText('a\n\n\nb')).toBe('a\n\nb')
  })

  it('normalizes CRLF to LF', () => {
    expect(normalizeText('a\r\nb')).toBe('a\nb')
  })
})

describe('normalizeCommitSummary', () => {
  it('normalizes valid input', () => {
    const result = normalizeCommitSummary({
      sha: 'abc',
      summary: '  Fixed bug  ',
      tags: ['fix', 'bug'],
      significance: 7,
    })
    expect(result.summary).toBe('Fixed bug')
    expect(result.significance).toBe(7)
    expect(result.tags).toEqual(['fix', 'bug'])
  })

  it('clamps significance to 1-10', () => {
    const r1 = normalizeCommitSummary({ sha: 'a', summary: 'x', tags: [], significance: 15 })
    expect(r1.significance).toBe(10)
    const r2 = normalizeCommitSummary({ sha: 'a', summary: 'x', tags: [], significance: -5 })
    expect(r2.significance).toBe(1)
  })

  it('defaults significance to 5 when missing', () => {
    const result = normalizeCommitSummary({ sha: 'a', summary: 'x', tags: [] })
    expect(result.significance).toBe(5)
  })

  it('throws on missing sha', () => {
    expect(() => normalizeCommitSummary({ summary: 'x', tags: [] })).toThrow()
  })
})

describe('normalizeNarrative', () => {
  it('normalizes valid input', () => {
    const result = normalizeNarrative({
      theme: '  Performance  ',
      story: 'We improved things.',
      keyPoints: ['point 1', 'point 2'],
      technicalDepth: 8,
    })
    expect(result.theme).toBe('Performance')
    expect(result.technicalDepth).toBe(8)
  })

  it('throws on non-object', () => {
    expect(() => normalizeNarrative('string')).toThrow()
  })
})

describe('normalizeGeneratedPost', () => {
  it('normalizes linkedin post', () => {
    const result = normalizeGeneratedPost({
      content: '  Great week!  ',
      hashtags: ['#dev'],
      callToAction: 'Read more',
    }, 'linkedin')
    expect(result.content).toBe('Great week!')
    expect(result.platform).toBe('linkedin')
  })

  it('soft-truncates twitter posts that exceed 280 chars', () => {
    const result = normalizeGeneratedPost(
      { content: 'x'.repeat(400), hashtags: [] },
      'twitter',
    )
    expect(result.content.length).toBeLessThanOrEqual(280)
    expect(result.content.endsWith('…')).toBe(true)
  })

  it('truncates at a word boundary when possible', () => {
    const long = 'word '.repeat(80).trim() // 80 words, way over 280 chars
    const result = normalizeGeneratedPost({ content: long, hashtags: [] }, 'twitter')
    expect(result.content.length).toBeLessThanOrEqual(280)
    // Should not chop in the middle of "word" — last visible char before the
    // ellipsis should be a letter, not a stray fragment.
    expect(result.content).toMatch(/(word|word…|word\s*…)$/)
  })

  it('accepts twitter post <= 280 chars', () => {
    const result = normalizeGeneratedPost({ content: 'x'.repeat(280), hashtags: [] }, 'twitter')
    expect(result.content).toHaveLength(280)
  })
})
