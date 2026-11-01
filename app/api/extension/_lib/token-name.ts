/** Default extension token name: "Chrome on 1 Nov 2026" (UTC date). */
export function defaultTokenName(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(now)
  return `Chrome on ${date}`
}
