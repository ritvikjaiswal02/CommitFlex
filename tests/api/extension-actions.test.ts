import { describe, it, expect, vi, beforeEach } from 'vitest'

const tokenAuth = vi.hoisted(() => ({ authenticateApiToken: vi.fn() }))
vi.mock('@/lib/auth/api-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/api-token')>()
  return { ...actual, authenticateApiToken: tokenAuth.authenticateApiToken }
})
vi.mock('@/lib/plans', () => ({ planErrorToResponse: vi.fn(() => null) }))
const queue = vi.hoisted(() => {
  class QueueError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  }
  return {
    QueueError,
    approveDraft: vi.fn(),
    undoExtensionPublish: vi.fn(),
    recordManualPublish: vi.fn(),
    queueErrorToResponse: vi.fn((err: unknown) =>
      err instanceof QueueError ? Response.json({ error: err.message, code: err.code }, { status: err.status }) : null,
    ),
  }
})
vi.mock('@/lib/autopilot/queue', () => queue)
const drafts = vi.hoisted(() => ({ getDraft: vi.fn() }))
vi.mock('@/lib/db/queries/drafts', () => drafts)
const connect = vi.hoisted(() => {
  class RepoConnectError extends Error {
    constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
      super(message)
    }
  }
  return { RepoConnectError, connectRepo: vi.fn() }
})
vi.mock('@/lib/repos/connect', () => connect)
vi.mock('@/lib/publish/intents', () => ({
  composePostText: (content: string) => content,
  buildXIntentUrl: (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
  buildLinkedInComposeUrl: (text: string) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
}))

import { POST as approve } from '@/app/api/extension/drafts/[draftId]/approve/route'
import { DELETE as undoPosted } from '@/app/api/extension/drafts/[draftId]/posted/route'
import { POST as connectRepoRoute } from '@/app/api/extension/repos/route'

const DRAFT_ID = '7d1c7a52-5a3e-4a59-9d1f-0a6c2c0a1b11'
const item = {
  id: 'q-1', draftId: DRAFT_ID, jobId: 'j', repoId: 'r', repoFullName: 'ritvik/commitflex', platform: 'linkedin',
  status: 'scheduled', content: 'Shipped retries', hashtags: [], scheduledFor: '2026-11-03T09:00:00.000Z',
  approvedAt: null, publishedAt: null, publishMethod: null, externalUrl: null, lastError: null, trigger: 'pr_merged',
  sourceTitle: null, createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z',
}

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://app.test${path}`, {
    ...init,
    headers: { Authorization: 'Bearer cfx_test', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  tokenAuth.authenticateApiToken.mockResolvedValue({ userId: 'user-1', tokenId: 't1', scopes: ['extension'] })
  drafts.getDraft.mockResolvedValue({ id: DRAFT_ID, userId: 'user-1', deletedAt: null })
  queue.approveDraft.mockResolvedValue(item)
  queue.undoExtensionPublish.mockResolvedValue({ ...item, status: 'ready' })
})

describe('POST /api/extension/drafts/:id/approve', () => {
  it('approves through the same queue logic as the app', async () => {
    const res = await approve(req(`/api/extension/drafts/${DRAFT_ID}/approve`, { method: 'POST' }), { params: { draftId: DRAFT_ID } })
    expect(res.status).toBe(200)
    expect(queue.approveDraft).toHaveBeenCalledWith('user-1', DRAFT_ID, 'owner')
    expect((await res.json()).item.status).toBe('scheduled')
  })

  it("answers 404 for someone else's draft", async () => {
    drafts.getDraft.mockResolvedValue({ id: DRAFT_ID, userId: 'other', deletedAt: null })
    const res = await approve(req(`/api/extension/drafts/${DRAFT_ID}/approve`, { method: 'POST' }), { params: { draftId: DRAFT_ID } })
    expect(res.status).toBe(404)
    expect(queue.approveDraft).not.toHaveBeenCalled()
  })

  it('needs a token', async () => {
    tokenAuth.authenticateApiToken.mockResolvedValue(null)
    const res = await approve(req(`/api/extension/drafts/${DRAFT_ID}/approve`, { method: 'POST' }), { params: { draftId: DRAFT_ID } })
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/extension/drafts/:id/posted (undo)', () => {
  it('puts an extension-marked post back to ready', async () => {
    const res = await undoPosted(req(`/api/extension/drafts/${DRAFT_ID}/posted`, { method: 'DELETE' }), { params: { draftId: DRAFT_ID } })
    expect(res.status).toBe(200)
    expect(queue.undoExtensionPublish).toHaveBeenCalledWith('user-1', DRAFT_ID)
  })
})

describe('POST /api/extension/repos', () => {
  it('connects a repository by full name', async () => {
    connect.connectRepo.mockResolvedValue({ repo: { id: 'r1', fullName: 'ritvik/commitflex', webhookId: 5 }, warning: null })
    const res = await connectRepoRoute(req('/api/extension/repos', { method: 'POST', body: JSON.stringify({ fullName: 'ritvik/commitflex' }) }))
    expect(res.status).toBe(201)
    expect(connect.connectRepo).toHaveBeenCalledWith('user-1', { fullName: 'ritvik/commitflex' })
    expect((await res.json()).repo).toEqual({ id: 'r1', fullName: 'ritvik/commitflex', webhookConfigured: true })
  })

  it('treats an already connected repo as success', async () => {
    connect.connectRepo.mockRejectedValue(
      new connect.RepoConnectError(409, 'already_connected', 'x', { repo: { id: 'r1', fullName: 'ritvik/commitflex', webhookId: null } }),
    )
    const res = await connectRepoRoute(req('/api/extension/repos', { method: 'POST', body: JSON.stringify({ fullName: 'ritvik/commitflex' }) }))
    expect(res.status).toBe(200)
  })

  it('rejects anything that is not owner/name', async () => {
    const res = await connectRepoRoute(req('/api/extension/repos', { method: 'POST', body: JSON.stringify({ fullName: '../etc' }) }))
    expect(res.status).toBe(400)
  })

  it('passes GitHub access problems through', async () => {
    connect.connectRepo.mockRejectedValue(new connect.RepoConnectError(403, 'no_access', 'You can read it but not push to it.'))
    const res = await connectRepoRoute(req('/api/extension/repos', { method: 'POST', body: JSON.stringify({ fullName: 'acme/api' }) }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('no_access')
  })
})
