import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/autopilot/planner', () => ({
  runAutopilotCron: vi.fn(async () => ({
    ok: true, digests: 1, cadenceJobs: 0, reminders: 2, trialEmails: 0, linkedinExpiryEmails: 0, durationMs: 5,
  })),
}))
vi.mock('@/lib/publish/cron', () => ({
  runPublishCron: vi.fn(async () => ({ ok: true, published: 3, ready: 1, retried: 0, failed: 0, durationMs: 7 })),
}))

import { runAutopilotCron } from '@/lib/autopilot/planner'
import { runPublishCron } from '@/lib/publish/cron'
import { GET as autopilotGet, POST as autopilotPost } from '@/app/api/cron/autopilot/route'
import { GET as publishGet } from '@/app/api/cron/publish/route'

const savedSecret = process.env.CRON_SECRET
const savedEnv = process.env.NODE_ENV

function req(auth?: string) {
  return new Request('http://localhost/api/cron/autopilot', { headers: auth ? { authorization: auth } : {} })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'cron-secret-value'
})

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = savedSecret
  ;(process.env as Record<string, string | undefined>).NODE_ENV = savedEnv
})

describe('cron auth', () => {
  it('rejects a missing or wrong bearer secret', async () => {
    expect((await autopilotGet(req())).status).toBe(401)
    expect((await autopilotGet(req('Bearer nope'))).status).toBe(401)
    expect(runAutopilotCron).not.toHaveBeenCalled()
  })

  it('runs with the right secret on GET and POST', async () => {
    const res = await autopilotGet(req('Bearer cron-secret-value'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, digests: 1, reminders: 2 })
    expect((await autopilotPost(req('Bearer cron-secret-value'))).status).toBe(200)
  })

  it('returns 503 in production when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    const res = await publishGet(req())
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('not_configured')
  })

  it('allows local runs without a secret outside production', async () => {
    delete process.env.CRON_SECRET
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
    const res = await publishGet(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ published: 3, ready: 1 })
    expect(runPublishCron).toHaveBeenCalled()
  })

  it('returns 500 with the error shape when the run throws', async () => {
    vi.mocked(runPublishCron).mockRejectedValueOnce(new Error('db down'))
    const res = await publishGet(req('Bearer cron-secret-value'))
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('internal_error')
  })
})
