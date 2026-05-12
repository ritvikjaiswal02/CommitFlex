import { describe, it, expect } from 'vitest'
import { filterCommits } from '@/lib/github/filter'
import type { RawCommit } from '@/types/github'

const commit = (overrides: Partial<RawCommit> = {}): RawCommit => ({
  sha: 'abc123',
  message: 'feat: add login',
  author: 'Alice',
  date: '2026-01-01T00:00:00Z',
  url: 'https://github.com/a/b/commit/abc123',
  ...overrides,
})

describe('filterCommits', () => {
  it('keeps normal commits', () => {
    const result = filterCommits([commit()])
    expect(result.commits).toHaveLength(1)
    expect(result.skippedShas).toHaveLength(0)
  })

  it('skips merge commits', () => {
    const result = filterCommits([commit({ message: 'Merge pull request #5 from foo/bar' })])
    expect(result.commits).toHaveLength(0)
    expect(result.skippedShas).toContain('abc123')
  })

  it('skips chore commits', () => {
    const result = filterCommits([commit({ message: 'chore: update deps' })])
    expect(result.commits).toHaveLength(0)
  })

  it('skips bot authors', () => {
    const result = filterCommits([commit({ author: 'dependabot[bot]' })])
    expect(result.commits).toHaveLength(0)
  })

  it('filters by author login when provided', () => {
    const commits = [
      commit({ sha: 'a1', author: 'Alice' }),
      commit({ sha: 'b2', author: 'Bob' }),
    ]
    const result = filterCommits(commits, 'alice')
    expect(result.commits).toHaveLength(1)
    expect(result.commits[0].sha).toBe('a1')
  })

  it('skips wip commits', () => {
    const result = filterCommits([commit({ message: 'wip: half done' })])
    expect(result.commits).toHaveLength(0)
  })
})
