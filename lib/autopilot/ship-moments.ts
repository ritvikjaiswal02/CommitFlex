/**
 * Ship-moment rules (PRODUCT_SPEC §5, flows B and C). Pure: the webhook route
 * parses the payload and these functions decide whether it is worth a post.
 */
import type { GithubPullRequestPayload, GithubReleasePayload } from '@/lib/validators/webhooks'

export const BOT_LOGINS = ['dependabot', 'renovate', 'github-actions']
export const SKIP_TITLE = /^(chore|build|ci|deps?|bump|release)(\(.+\))?:/i
export const SKIP_LABELS = ['dependencies', 'chore', 'skip-changelog', 'no-post']
export const MIN_CHANGED_LINES = 20

export type ShipSkipReason =
  | 'not_merged'
  | 'bot_author'
  | 'chore_title'
  | 'skip_label'
  | 'too_small'
  | 'not_published'
  | 'prerelease'
  | 'draft'
  | 'non_default_branch'

export type ShipDecision = { ok: true } | { ok: false; reason: ShipSkipReason }

export function isBotLogin(login: string | null | undefined): boolean {
  if (!login) return false
  const lower = login.toLowerCase()
  if (lower.endsWith('[bot]')) return true
  return BOT_LOGINS.some((b) => lower === b || lower.startsWith(`${b}-`))
}

export function evaluatePullRequest(payload: GithubPullRequestPayload, defaultBranch?: string): ShipDecision {
  const pr = payload.pull_request
  if (payload.action !== 'closed' || !pr.merged) return { ok: false, reason: 'not_merged' }
  if (defaultBranch && pr.base?.ref && pr.base.ref !== defaultBranch) return { ok: false, reason: 'non_default_branch' }
  if (isBotLogin(pr.user?.login)) return { ok: false, reason: 'bot_author' }
  if (SKIP_TITLE.test(pr.title.trim())) return { ok: false, reason: 'chore_title' }
  const labels = (pr.labels ?? []).map((l) => l.name.toLowerCase())
  if (labels.some((l) => SKIP_LABELS.includes(l))) return { ok: false, reason: 'skip_label' }
  // Payloads without line counts are given the benefit of the doubt.
  if (pr.additions !== undefined && pr.deletions !== undefined && pr.additions + pr.deletions < MIN_CHANGED_LINES) {
    return { ok: false, reason: 'too_small' }
  }
  return { ok: true }
}

export function evaluateRelease(payload: GithubReleasePayload): ShipDecision {
  if (payload.action !== 'published') return { ok: false, reason: 'not_published' }
  if (payload.release.prerelease) return { ok: false, reason: 'prerelease' }
  if (payload.release.draft) return { ok: false, reason: 'draft' }
  if (isBotLogin(payload.release.author?.login)) return { ok: false, reason: 'bot_author' }
  return { ok: true }
}
