import { describe, it, expect, vi } from 'vitest'
import { fetchCommits, parseRepoUrl } from '@/lib/github/commits'

const makeOctokit = (pages: any[][]) => {
  let call = 0
  return {
    repos: {
      listCommits: vi.fn().mockImplementation(async () => {
        const data = pages[call] ?? []
        call++
        return { data }
      }),
    },
  } as any
}

describe('fetchCommits', () => {
  it('returns commits from a single page', async () => {
    const commit = {
      sha: 'abc',
      commit: { message: 'fix: bug', author: { name: 'Alice', date: '2026-01-01T00:00:00Z' } },
      html_url: 'https://github.com/a/b/commit/abc',
    }
    const octokit = makeOctokit([[commit]])
    const result = await fetchCommits(octokit, 'a', 'b', new Date('2026-01-01'), new Date('2026-01-08'))
    expect(result).toHaveLength(1)
    expect(result[0].sha).toBe('abc')
    expect(result[0].author).toBe('Alice')
  })

  it('paginates when first page has 100 results', async () => {
    const makeCommit = (i: number) => ({
      sha: `sha-${i}`,
      commit: { message: `commit ${i}`, author: { name: 'Bob', date: '2026-01-01T00:00:00Z' } },
      html_url: `https://github.com/a/b/commit/sha-${i}`,
    })
    const page1 = Array.from({ length: 100 }, (_, i) => makeCommit(i))
    const page2 = [makeCommit(100)]
    const octokit = makeOctokit([page1, page2])
    const result = await fetchCommits(octokit, 'a', 'b', new Date('2026-01-01'), new Date('2026-01-08'))
    expect(result).toHaveLength(101)
  })

  it('returns empty array when no commits', async () => {
    const octokit = makeOctokit([[]])
    const result = await fetchCommits(octokit, 'a', 'b', new Date('2026-01-01'), new Date('2026-01-08'))
    expect(result).toHaveLength(0)
  })
})

describe('parseRepoUrl', () => {
  it('parses https URL', () => {
    expect(parseRepoUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses .git suffix', () => {
    expect(parseRepoUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('throws on invalid URL', () => {
    expect(() => parseRepoUrl('https://gitlab.com/owner/repo')).toThrow()
  })
})
