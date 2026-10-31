/** Default CommitFlex origin baked in at build time (COMMITFLEX_APP_URL), e.g. https://commitflex.app */
export const DEFAULT_APP_URL: string = __APP_URL__
/** Origins the bridge content script is declared for in the manifest. */
export const BUILT_IN_APP_ORIGINS: string[] = __APP_ORIGINS__
export const VERSION: string = __VERSION__

/** How often the toolbar badge refreshes the ready count. */
export const BADGE_REFRESH_MINUTES = 10
/** Background check for jobs started from GitHub, in case the tab was closed. */
export const JOB_ALARM_MINUTES = 0.5
/** Give up tracking a job after this long. */
export const JOB_TRACK_TIMEOUT_MS = 15 * 60 * 1000
/** A cached queue is shown instantly and refreshed when older than this. */
export const QUEUE_STALE_MS = 30 * 1000

/** Normalises a user-entered URL to an origin (scheme + host + port), or null. */
export function toOrigin(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}

/** Match pattern for an origin: chrome match patterns take scheme://host[:port]/path. */
export function originPattern(origin: string): string {
  return `${origin}/*`
}
