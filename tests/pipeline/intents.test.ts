import { describe, it, expect } from 'vitest'
import { buildLinkedInComposeUrl, buildXIntentUrl, composePostText } from '@/lib/publish/intents'
import { isBotLogin, evaluatePullRequest, evaluateRelease } from '@/lib/autopilot/ship-moments'

describe('composePostText', () => {
  it('appends hashtags that are not already in the body', () => {
    const text = composePostText('Shipped retries for #webhooks today.', ['#webhooks', 'typescript', '#TypeScript'], 'linkedin')
    expect(text).toBe('Shipped retries for #webhooks today.\n\n#typescript')
  })

  it('keeps X posts within 280 characters, dropping hashtags first', () => {
    const body = 'a'.repeat(270)
    const text = composePostText(body, ['#one', '#two'], 'twitter')
    expect(text.length).toBeLessThanOrEqual(280)
    // "#one" fits (276 chars), "#two" would not.
    expect(text).toBe(`${body}\n\n#one`)
    expect(composePostText('b'.repeat(276), ['#one'], 'twitter')).toBe('b'.repeat(276))
  })

  it('truncates an over-long X body at a word boundary', () => {
    const body = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const text = composePostText(body, [], 'twitter')
    expect(text.length).toBeLessThanOrEqual(280)
    expect(text.endsWith('…')).toBe(true)
  })

  it('ignores empty or punctuation-only tags', () => {
    expect(composePostText('Hello', ['#', ' ', '#!!'], 'linkedin')).toBe('Hello')
  })
})

describe('intent URLs', () => {
  it('builds an X intent URL with encoded text', () => {
    expect(buildXIntentUrl('Hi & bye')).toBe('https://x.com/intent/post?text=Hi%20%26%20bye')
    expect(buildXIntentUrl('Hi', { hashtags: ['dev'] })).toBe(`https://x.com/intent/post?text=${encodeURIComponent('Hi\n\n#dev')}`)
  })

  it('builds a LinkedIn compose URL', () => {
    expect(buildLinkedInComposeUrl('New release')).toBe('https://www.linkedin.com/feed/?shareActive=true&text=New%20release')
  })
})

describe('ship-moment rules', () => {
  const base = {
    action: 'closed',
    repository: { id: 1, full_name: 'a/b' },
    pull_request: {
      number: 1,
      title: 'Add search',
      html_url: 'https://github.com/a/b/pull/1',
      merged: true,
      additions: 50,
      deletions: 10,
      user: { login: 'alice' },
      labels: [],
      base: { ref: 'main' },
    },
  }

  it('detects bots', () => {
    expect(isBotLogin('dependabot[bot]')).toBe(true)
    expect(isBotLogin('renovate')).toBe(true)
    expect(isBotLogin('github-actions')).toBe(true)
    expect(isBotLogin('alice')).toBe(false)
    expect(isBotLogin('renovator')).toBe(false)
  })

  it('accepts a meaningful merged PR', () => {
    expect(evaluatePullRequest(base as any, 'main')).toEqual({ ok: true })
  })

  it.each([
    ['fix(ci): flaky test', true],
    ['deps: bump zod', false],
    ['release: v1.2', false],
    ['bump: version', false],
    ['Build pipeline overhaul', true],
  ])('title %s → ok=%s', (title, ok) => {
    const r = evaluatePullRequest({ ...base, pull_request: { ...base.pull_request, title } } as any)
    expect(r.ok).toBe(ok)
  })

  it('rejects prerelease releases and accepts published ones', () => {
    const release = {
      action: 'published',
      repository: { id: 1, full_name: 'a/b' },
      release: { id: 9, tag_name: 'v1', html_url: 'x', draft: false, prerelease: false, author: { login: 'alice' } },
    }
    expect(evaluateRelease(release as any)).toEqual({ ok: true })
    expect(evaluateRelease({ ...release, release: { ...release.release, prerelease: true } } as any)).toEqual({
      ok: false,
      reason: 'prerelease',
    })
  })
})
