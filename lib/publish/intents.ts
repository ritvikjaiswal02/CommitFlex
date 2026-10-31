/**
 * Hand-off links for posting outside the API. Pure and client-safe: no server
 * imports, no env access. Used by the queue, emails and the Chrome extension.
 */
import type { PostPlatform } from '@/types/posts'

export const X_CHAR_LIMIT = 280
export const LINKEDIN_CHAR_LIMIT = 3000

const NOT_TAG_CHAR = new RegExp('[^\\p{L}\\p{N}_]', 'gu')

/** Normalises '#Foo', 'foo', ' #foo ' to 'Foo'/'foo' (no hash, no punctuation). */
function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').replace(NOT_TAG_CHAR, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasTag(text: string, tag: string): boolean {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])#${escapeRegExp(tag)}(?![\\p{L}\\p{N}_])`, 'iu')
  return pattern.test(text)
}

export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const room = max - 1
  const slice = text.slice(0, room)
  const lastSpace = slice.lastIndexOf(' ')
  const safe = lastSpace > room * 0.7 ? slice.slice(0, lastSpace) : slice
  return safe.trimEnd() + '…'
}

/**
 * Builds the final text for a platform: the draft content plus any hashtags
 * not already written into the body. On X the result never exceeds 280
 * characters: hashtags are dropped first (last to first), then the body is
 * trimmed at a word boundary.
 */
export function composePostText(content: string, hashtags: string[], platform: PostPlatform): string {
  const body = content.trim().replace(/\r\n/g, '\n')
  const tags: string[] = []
  for (const raw of hashtags) {
    const tag = cleanTag(raw)
    if (!tag) continue
    if (hasTag(body, tag)) continue
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue
    tags.push(tag)
  }

  const join = (t: string[]) => (t.length ? `${body}\n\n${t.map((x) => `#${x}`).join(' ')}` : body)

  if (platform === 'linkedin') {
    const full = join(tags)
    return full.length <= LINKEDIN_CHAR_LIMIT ? full : truncateAtWord(full, LINKEDIN_CHAR_LIMIT)
  }

  const kept = [...tags]
  let text = join(kept)
  while (text.length > X_CHAR_LIMIT && kept.length > 0) {
    kept.pop()
    text = join(kept)
  }
  return text.length <= X_CHAR_LIMIT ? text : truncateAtWord(text, X_CHAR_LIMIT)
}

/** https://x.com/intent/post?text=… (hashtags are folded into the text). */
export function buildXIntentUrl(text: string, opts?: { hashtags?: string[] }): string {
  const finalText = opts?.hashtags?.length ? composePostText(text, opts.hashtags, 'twitter') : text
  return `https://x.com/intent/post?text=${encodeURIComponent(finalText)}`
}

/** Opens the LinkedIn share composer pre-filled with the text. */
export function buildLinkedInComposeUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`
}

/** The right hand-off URL for a platform, given the composed text. */
export function buildIntentUrl(platform: PostPlatform, text: string): string {
  return platform === 'twitter' ? buildXIntentUrl(text) : buildLinkedInComposeUrl(text)
}
