import { describe, it, expect } from 'vitest'
import { parseGithubUrl } from '@/lib/github/url'

describe('parseGithubUrl', () => {
  it('parses pull request URLs, including sub-pages', () => {
    expect(parseGithubUrl('https://github.com/acme/widget/pull/42')).toEqual({
      kind: 'pr', owner: 'acme', repo: 'widget', number: 42, url: 'https://github.com/acme/widget/pull/42',
    })
    expect(parseGithubUrl('github.com/acme/widget/pull/42/files?diff=split')).toMatchObject({ kind: 'pr', number: 42 })
  })

  it('parses the owner/repo#N shorthand', () => {
    expect(parseGithubUrl('acme/widget#7')).toMatchObject({ kind: 'pr', owner: 'acme', repo: 'widget', number: 7 })
  })

  it('parses release tag URLs, including tags with slashes', () => {
    expect(parseGithubUrl('https://github.com/acme/widget/releases/tag/v1.2.0')).toMatchObject({
      kind: 'release', tag: 'v1.2.0',
    })
    expect(parseGithubUrl('https://github.com/acme/widget/releases/tag/pkg/v2')).toMatchObject({ kind: 'release', tag: 'pkg/v2' })
  })

  it('parses repo URLs', () => {
    expect(parseGithubUrl('https://github.com/acme/widget')).toEqual({
      kind: 'repo', owner: 'acme', repo: 'widget', url: 'https://github.com/acme/widget',
    })
    expect(parseGithubUrl('https://github.com/acme/widget.git')).toMatchObject({ kind: 'repo', repo: 'widget' })
    expect(parseGithubUrl('https://github.com/acme/widget/tree/main/src')).toMatchObject({ kind: 'repo' })
  })

  it('rejects other hosts, reserved paths and junk', () => {
    expect(parseGithubUrl('https://gitlab.com/acme/widget/pull/1')).toBeNull()
    expect(parseGithubUrl('https://github.com/settings/profile')).toBeNull()
    expect(parseGithubUrl('https://github.com/acme')).toBeNull()
    expect(parseGithubUrl('https://github.com/acme/widget/issues/3')).toBeNull()
    expect(parseGithubUrl('')).toBeNull()
    expect(parseGithubUrl('not a url at all')).toBeNull()
  })
})
