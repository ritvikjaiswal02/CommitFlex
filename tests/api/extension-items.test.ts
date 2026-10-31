import { describe, it, expect } from 'vitest'
import {
  draftRowToExtensionItem,
  draftToExtensionItem,
  hashtagsFromMetadata,
  queueItemToExtensionItem,
} from '@/app/api/extension/_lib/items'
import { isExtensionMessage, EXTENSION_SOURCE } from '@/app/extension/_components/bridge-protocol'
import type { QueueItemView } from '@/types/autopilot'

const BASE = 'https://app.test'

function view(overrides: Partial<QueueItemView> = {}): QueueItemView {
  return {
    id: 'q-1', draftId: 'd-1', jobId: 'job-1', repoId: 'r-1', repoFullName: 'ritvik/commitflex',
    platform: 'twitter', status: 'ready', content: 'Shipped webhook retries.', hashtags: ['#buildinpublic'],
    scheduledFor: null, approvedAt: null, publishedAt: null, publishMethod: null, externalUrl: null, lastError: null,
    trigger: 'pr_merged', sourceTitle: 'Retry webhooks', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('ExtensionItem mapping (real intents)', () => {
  it('composes X text within 280 characters and builds an X intent URL', () => {
    const item = queueItemToExtensionItem(view({ content: 'x'.repeat(275), hashtags: ['#buildinpublic'] }), BASE)
    expect(item.text.length).toBeLessThanOrEqual(280)
    expect(item.intentUrl.startsWith('https://x.com/intent/post?text=')).toBe(true)
    expect(item.appUrl).toBe('https://app.test/jobs/job-1')
    expect(item.queueItemId).toBe('q-1')
  })

  it('appends hashtags for LinkedIn and links to the LinkedIn composer', () => {
    const item = queueItemToExtensionItem(view({ platform: 'linkedin', content: 'A longer LinkedIn post.' }), BASE)
    expect(item.text).toContain('A longer LinkedIn post.')
    expect(item.text).toContain('#buildinpublic')
    expect(item.intentUrl.startsWith('https://www.linkedin.com/')).toBe(true)
  })

  it('maps unqueued drafts to status draft', () => {
    const item = draftToExtensionItem(
      { id: 'd-9', jobId: 'job-9', platform: 'linkedin', status: 'generated', content: 'Hello', hashtags: [], repoFullName: 'r/r', queueStatus: null, createdAt: '2026-11-01T00:00:00.000Z' },
      BASE,
    )
    expect(item).toMatchObject({ draftId: 'd-9', status: 'draft', queueItemId: null, scheduledFor: null })
  })

  it('skips draft rows with an unknown platform and prefers edited content', () => {
    const ctx = { base: BASE, repoFullName: 'r/r', queue: null }
    expect(
      draftRowToExtensionItem({ id: 'a', jobId: 'j', platform: 'mastodon', originalContent: 'x', editedContent: null, platformMetadata: null, createdAt: new Date() }, ctx),
    ).toBeNull()
    const item = draftRowToExtensionItem(
      { id: 'b', jobId: 'j', platform: 'linkedin', originalContent: 'old', editedContent: 'new text', platformMetadata: { hashtags: ['#a', 3] }, createdAt: '2026-11-01T00:00:00.000Z' },
      ctx,
    )
    expect(item?.text).toContain('new text')
    expect(item?.text).not.toContain('old')
  })

  it('reads only string hashtags from metadata', () => {
    expect(hashtagsFromMetadata({ hashtags: ['#a', 1, null, '#b'] })).toEqual(['#a', '#b'])
    expect(hashtagsFromMetadata(null)).toEqual([])
  })
})

describe('bridge protocol', () => {
  it('accepts only messages from the extension source', () => {
    expect(isExtensionMessage({ source: EXTENSION_SOURCE, type: 'pong' })).toBe(true)
    expect(isExtensionMessage({ source: 'commitflex-page', type: 'ping' })).toBe(false)
    expect(isExtensionMessage({ source: EXTENSION_SOURCE })).toBe(false)
    expect(isExtensionMessage(null)).toBe(false)
    expect(isExtensionMessage('commitflex-extension')).toBe(false)
  })
})
