import type { RawCommit } from '@/types/github'

// Patterns for common secret formats
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /ghp_[A-Za-z0-9]{36}/g, replacement: '[GITHUB_TOKEN]' },
  { pattern: /gh[ors]_[A-Za-z0-9]{36}/g, replacement: '[GITHUB_TOKEN]' },
  { pattern: /sk-[A-Za-z0-9]{48}/g, replacement: '[API_KEY]' },
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /password[=:]\s*\S+/gi, replacement: 'password=[REDACTED]' },
  { pattern: /secret[=:]\s*\S+/gi, replacement: 'secret=[REDACTED]' },
  { pattern: /token[=:]\s*\S+/gi, replacement: 'token=[REDACTED]' },
  { pattern: /key[=:]\s*[A-Za-z0-9+/]{20,}={0,2}/gi, replacement: 'key=[REDACTED]' },
  // AWS-style keys
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[AWS_ACCESS_KEY]' },
]

export function sanitizeCommitMessage(message: string): string {
  let result = message
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

export function sanitizeCommits(commits: RawCommit[]): RawCommit[] {
  return commits.map(c => ({ ...c, message: sanitizeCommitMessage(c.message) }))
}
