import { describe, it, expect } from 'vitest'
import { normaliseFingerprint } from '@/lib/ai/voice-analyzer'

describe('normaliseFingerprint', () => {
  it('returns the string unchanged when it already starts with the prefix', () => {
    const raw = 'Voice fingerprint: terse, em-dash heavy, ends on a question.'
    expect(normaliseFingerprint(raw)).toBe(raw)
  })

  it('prepends the prefix when missing', () => {
    const raw = 'Terse, em-dash heavy, ends on a question.'
    expect(normaliseFingerprint(raw)).toBe(`Voice fingerprint: ${raw}`)
  })

  it('strips surrounding code fences', () => {
    const raw = '```\nVoice fingerprint: short sentences, no emoji.\n```'
    expect(normaliseFingerprint(raw)).toBe('Voice fingerprint: short sentences, no emoji.')
  })

  it('strips blockquote markers', () => {
    const raw = '> Voice fingerprint: punchy openers and a final question.'
    expect(normaliseFingerprint(raw)).toBe('Voice fingerprint: punchy openers and a final question.')
  })

  it('collapses whitespace and newlines', () => {
    const raw = 'Voice fingerprint:   short\n\nsentences,   minimal emoji.'
    expect(normaliseFingerprint(raw)).toBe('Voice fingerprint: short sentences, minimal emoji.')
  })

  it('treats the prefix case-insensitively', () => {
    const raw = 'voice fingerprint: lowercase prefix in raw output'
    expect(normaliseFingerprint(raw)).toBe(raw)
  })
})
