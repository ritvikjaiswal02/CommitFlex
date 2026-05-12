import type { CommitSummary, Narrative, GeneratedPost } from '@/types/ai'

export function normalizeText(text: string): string {
  return text.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

export function normalizeCommitSummary(raw: unknown): CommitSummary {
  if (typeof raw !== 'object' || raw === null) throw new Error('CommitSummary must be an object')
  const r = raw as Record<string, unknown>
  if (typeof r.sha !== 'string') throw new Error('CommitSummary.sha must be a string')
  if (typeof r.summary !== 'string') throw new Error('CommitSummary.summary must be a string')
  if (!Array.isArray(r.tags)) throw new Error('CommitSummary.tags must be an array')
  return {
    sha: r.sha,
    summary: normalizeText(r.summary),
    tags: r.tags.filter((t): t is string => typeof t === 'string'),
    significance: typeof r.significance === 'number' ? Math.min(10, Math.max(1, r.significance)) : 5,
  }
}

export function normalizeNarrative(raw: unknown): Narrative {
  if (typeof raw !== 'object' || raw === null) throw new Error('Narrative must be an object')
  const r = raw as Record<string, unknown>
  if (typeof r.theme !== 'string') throw new Error('Narrative.theme must be a string')
  if (typeof r.story !== 'string') throw new Error('Narrative.story must be a string')
  if (!Array.isArray(r.keyPoints)) throw new Error('Narrative.keyPoints must be an array')
  return {
    theme: normalizeText(r.theme),
    story: normalizeText(r.story),
    keyPoints: r.keyPoints.filter((p): p is string => typeof p === 'string').map(normalizeText),
    technicalDepth: typeof r.technicalDepth === 'number' ? Math.min(10, Math.max(1, r.technicalDepth)) : 5,
  }
}

export function normalizeGeneratedPost(raw: unknown, platform: 'linkedin' | 'twitter'): GeneratedPost {
  if (typeof raw !== 'object' || raw === null) throw new Error('GeneratedPost must be an object')
  const r = raw as Record<string, unknown>
  if (typeof r.content !== 'string') throw new Error('GeneratedPost.content must be a string')
  const content = normalizeText(r.content)
  if (platform === 'twitter' && content.length > 280) {
    throw new Error(`Twitter post exceeds 280 chars (got ${content.length})`)
  }
  return {
    platform,
    content,
    hashtags: Array.isArray(r.hashtags)
      ? r.hashtags.filter((h): h is string => typeof h === 'string')
      : [],
    callToAction: typeof r.callToAction === 'string' ? normalizeText(r.callToAction) : undefined,
  }
}
