import { describe, it, expect } from 'vitest'
import { sanitizeCommitMessage, sanitizeCommits } from '@/lib/github/sanitize'
import type { RawCommit } from '@/types/github'

describe('sanitizeCommitMessage', () => {
  it('redacts GitHub tokens', () => {
    const msg = 'add token ghp_abcdefghijklmnopqrstuvwxyz1234567890'
    expect(sanitizeCommitMessage(msg)).not.toContain('ghp_')
    expect(sanitizeCommitMessage(msg)).toContain('[GITHUB_TOKEN]')
  })

  it('redacts password assignments', () => {
    const msg = 'set password=supersecret123'
    expect(sanitizeCommitMessage(msg)).toContain('[REDACTED]')
    expect(sanitizeCommitMessage(msg)).not.toContain('supersecret123')
  })

  it('redacts AWS access keys', () => {
    const msg = 'used AKIAIOSFODNN7EXAMPLE in script'
    expect(sanitizeCommitMessage(msg)).toContain('[AWS_ACCESS_KEY]')
  })

  it('leaves safe messages unchanged', () => {
    const msg = 'feat: add user profile page'
    expect(sanitizeCommitMessage(msg)).toBe(msg)
  })
})

describe('sanitizeCommits', () => {
  it('sanitizes all commits in array', () => {
    const commits: RawCommit[] = [
      { sha: 'a', message: 'add token=secret123', author: 'Alice', date: '2026-01-01T00:00:00Z', url: 'https://github.com/a/b/commit/a' },
      { sha: 'b', message: 'fix: normal commit', author: 'Alice', date: '2026-01-01T00:00:00Z', url: 'https://github.com/a/b/commit/b' },
    ]
    const result = sanitizeCommits(commits)
    expect(result[0].message).toContain('[REDACTED]')
    expect(result[1].message).toBe('fix: normal commit')
  })
})
