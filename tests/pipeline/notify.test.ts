import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so the mock factory can safely reference the stub at module init.
const { dbStub } = vi.hoisted(() => ({
  dbStub: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/db/client', () => ({ db: dbStub }))
vi.mock('@/lib/db/queries/notifications', () => ({
  getPrefs: vi.fn(),
  hasEmailedFor: vi.fn(),
  logEmail: vi.fn(),
}))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))

// Imports come AFTER the mocks so the production module picks up the stubs.
import { hasEmailedFor, getPrefs, logEmail } from '@/lib/db/queries/notifications'
import { sendEmail } from '@/lib/mailer'
import { notifyJobComplete } from '@/lib/pipeline/notify'

type Row = Record<string, unknown>
function chainable(rows: Row[]) {
  const obj: {
    from: () => typeof obj
    where: () => typeof obj
    limit: () => Promise<Row[]>
    then: (cb: (v: Row[]) => unknown) => Promise<unknown>
  } = {
    from: () => obj,
    where: () => obj,
    limit: () => Promise.resolve(rows),
    then: (cb) => Promise.resolve(rows).then(cb),
  }
  return obj
}

const mockJob = { id: 'job-1', userId: 'user-1', repoId: 'repo-1' }
const mockUser = { id: 'user-1', email: 'dev@example.com', name: 'Alex Chen' }
const mockRepo = { id: 'repo-1', fullName: 'acme/widget' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hasEmailedFor).mockResolvedValue(false)
  vi.mocked(getPrefs).mockResolvedValue({ emailOnComplete: true } as any)
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, providerMessageId: 'msg-123' })

  let callIdx = 0
  dbStub.select.mockImplementation(() => {
    const idx = callIdx++
    if (idx === 0) return chainable([mockJob])
    if (idx === 1) return chainable([mockUser])
    if (idx === 2) return chainable([mockRepo])
    return chainable([{ id: 'd1' }, { id: 'd2' }])
  })
})

describe('notifyJobComplete', () => {
  it('skips silently when already emailed for this job (idempotency)', async () => {
    vi.mocked(hasEmailedFor).mockResolvedValue(true)
    await notifyJobComplete('job-1')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(logEmail).not.toHaveBeenCalled()
  })

  it('skips when user has emailOnComplete=false', async () => {
    vi.mocked(getPrefs).mockResolvedValue({ emailOnComplete: false } as any)
    await notifyJobComplete('job-1')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends the email and writes a sent log on success', async () => {
    await notifyJobComplete('job-1')
    expect(sendEmail).toHaveBeenCalled()
    expect(logEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      jobId: 'job-1',
      kind: 'generation_complete',
      deliveryStatus: 'sent',
      providerMessageId: 'msg-123',
    }))
  })

  it('logs delivery as "console-only" when mailer reports consoleOnly', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, consoleOnly: true })
    await notifyJobComplete('job-1')
    expect(logEmail).toHaveBeenCalledWith(expect.objectContaining({ deliveryStatus: 'console-only' }))
  })

  it('logs failed delivery when mailer reports an error', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: 'boom' })
    await notifyJobComplete('job-1')
    expect(logEmail).toHaveBeenCalledWith(expect.objectContaining({
      deliveryStatus: 'failed',
      errorMessage: 'boom',
    }))
  })

  it('never throws even if everything blows up', async () => {
    dbStub.select.mockImplementation(() => { throw new Error('db gone') })
    await expect(notifyJobComplete('job-1')).resolves.toBeUndefined()
  })
})
