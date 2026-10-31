/**
 * Parses github.com links the extension and the generate form accept. Pure.
 *   https://github.com/o/r/pull/12           → pr
 *   https://github.com/o/r/pull/12/files     → pr
 *   https://github.com/o/r/releases/tag/v1.2 → release
 *   https://github.com/o/r                   → repo
 *   o/r#12                                   → pr (shorthand)
 */
export type ParsedGithubUrl =
  | { kind: 'pr'; owner: string; repo: string; number: number; url: string }
  | { kind: 'release'; owner: string; repo: string; tag: string; url: string }
  | { kind: 'repo'; owner: string; repo: string; url: string }

const NAME = /^[A-Za-z0-9_.-]+$/
const RESERVED_OWNERS = new Set([
  'settings', 'orgs', 'organizations', 'marketplace', 'explore', 'topics', 'notifications',
  'login', 'logout', 'join', 'sponsors', 'features', 'about', 'pricing', 'search', 'new',
])

function validNames(owner: string, repo: string): boolean {
  return NAME.test(owner) && NAME.test(repo) && !RESERVED_OWNERS.has(owner.toLowerCase()) && repo !== '.' && repo !== '..'
}

export function parseGithubUrl(input: string): ParsedGithubUrl | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const short = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/.exec(trimmed)
  if (short) {
    const [, owner, repo, num] = short
    if (!validNames(owner, repo)) return null
    const number = Number(num)
    return { kind: 'pr', owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` }
  }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'www.github.com') return null

  const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  if (parts.length < 2) return null
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/i, '')
  if (!validNames(owner, repo)) return null
  const base = `https://github.com/${owner}/${repo}`

  if (parts[2] === 'pull' && parts[3] && /^\d+$/.test(parts[3])) {
    const number = Number(parts[3])
    return { kind: 'pr', owner, repo, number, url: `${base}/pull/${number}` }
  }
  if (parts[2] === 'releases' && parts[3] === 'tag' && parts.length >= 5) {
    const tag = parts.slice(4).join('/')
    if (!tag) return null
    return { kind: 'release', owner, repo, tag, url: `${base}/releases/tag/${encodeURIComponent(tag)}` }
  }
  if (parts.length === 2 || parts[2] === 'tree' || parts[2] === 'commits' || parts[2] === 'releases' || parts[2] === 'pulls') {
    return { kind: 'repo', owner, repo, url: base }
  }
  return null
}
