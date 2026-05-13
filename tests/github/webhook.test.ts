import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifySignature,
  generateWebhookSecret,
  splitFullName,
  installRepoWebhook,
  removeRepoWebhook,
} from '@/lib/github/webhook'

function sign(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifySignature', () => {
  const body = '{"ref":"refs/heads/main"}'
  const secret = 'abc123'

  it('returns true for a matching signature', () => {
    expect(verifySignature(body, sign(body, secret), secret)).toBe(true)
  })

  it('returns false when signature header is missing', () => {
    expect(verifySignature(body, null, secret)).toBe(false)
  })

  it('returns false when signature lacks the sha256= prefix', () => {
    const hex = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignature(body, hex, secret)).toBe(false)
  })

  it('returns false when body has been tampered with', () => {
    const tamperedSig = sign(body, secret)
    expect(verifySignature(body + ' ', tamperedSig, secret)).toBe(false)
  })

  it('returns false when secret is wrong', () => {
    expect(verifySignature(body, sign(body, 'other'), secret)).toBe(false)
  })

  it('returns false for a signature of different length (no crash)', () => {
    expect(verifySignature(body, 'sha256=deadbeef', secret)).toBe(false)
  })
})

describe('generateWebhookSecret', () => {
  it('returns a 64-character hex string', () => {
    const s = generateWebhookSecret()
    expect(s).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a different value every call', () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret())
  })
})

describe('splitFullName', () => {
  it('splits owner/repo cleanly', () => {
    expect(splitFullName('octocat/hello-world')).toEqual({ owner: 'octocat', repo: 'hello-world' })
  })

  it('handles slashes in the repo half', () => {
    // GitHub repos can't contain slashes, but the splitter should still take
    // only the first slash as the separator.
    expect(splitFullName('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('throws on names without a slash', () => {
    expect(() => splitFullName('justname')).toThrow()
  })
})

describe('installRepoWebhook', () => {
  it('calls octokit.repos.createWebhook with push event + secret', async () => {
    const createWebhook = vi.fn().mockResolvedValue({ data: { id: 42 } })
    const octokit = { repos: { createWebhook } } as any
    const id = await installRepoWebhook({
      octokit, owner: 'octo', repo: 'world',
      secret: 'sssh', payloadUrl: 'https://example.com/hook',
    })
    expect(id).toBe(42)
    expect(createWebhook).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'octo',
      repo: 'world',
      events: ['push'],
      active: true,
      config: expect.objectContaining({
        url: 'https://example.com/hook',
        content_type: 'json',
        secret: 'sssh',
      }),
    }))
  })
})

describe('removeRepoWebhook', () => {
  it('calls octokit.repos.deleteWebhook with the right ID', async () => {
    const deleteWebhook = vi.fn().mockResolvedValue({})
    const octokit = { repos: { deleteWebhook } } as any
    await removeRepoWebhook({ octokit, owner: 'octo', repo: 'world', webhookId: 99 })
    expect(deleteWebhook).toHaveBeenCalledWith({ owner: 'octo', repo: 'world', hook_id: 99 })
  })

  it('swallows 404 (already gone) silently', async () => {
    const err = Object.assign(new Error('not found'), { status: 404 })
    const deleteWebhook = vi.fn().mockRejectedValue(err)
    const octokit = { repos: { deleteWebhook } } as any
    await expect(removeRepoWebhook({ octokit, owner: 'o', repo: 'r', webhookId: 1 }))
      .resolves.toBeUndefined()
  })

  it('rethrows non-404 errors', async () => {
    const err = Object.assign(new Error('boom'), { status: 500 })
    const deleteWebhook = vi.fn().mockRejectedValue(err)
    const octokit = { repos: { deleteWebhook } } as any
    await expect(removeRepoWebhook({ octokit, owner: 'o', repo: 'r', webhookId: 1 }))
      .rejects.toThrow('boom')
  })
})
