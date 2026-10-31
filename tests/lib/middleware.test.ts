import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// auth(handler) wraps the handler; the test calls it with `req.auth` set directly.
vi.mock('@/auth.edge', () => ({ auth: (handler: unknown) => handler }))

import middleware, { isApiPath, isPublicPath, safeNextPath } from '@/middleware'

type Handler = (req: NextRequest & { auth: unknown }) => Response
const run = (url: string, signedIn: boolean) => {
  const req = new NextRequest(new URL(url, 'https://app.test')) as NextRequest & { auth: unknown }
  req.auth = signedIn ? { user: { id: 'u1' } } : null
  return (middleware as unknown as Handler)(req)
}

describe('path helpers', () => {
  it('knows the public pages', () => {
    for (const p of ['/', '/login', '/pricing', '/terms', '/privacy', '/queue/approved', '/pricing/faq', '/opengraph-image']) {
      expect(isPublicPath(p), p).toBe(true)
    }
    for (const p of ['/dashboard', '/onboarding', '/queue', '/billing', '/extension', '/pricingx', '/termsheet']) {
      expect(isPublicPath(p), p).toBe(false)
    }
  })

  it('detects api paths', () => {
    expect(isApiPath('/api/cron/publish')).toBe(true)
    expect(isApiPath('/apical')).toBe(false)
  })

  it('only accepts same-origin next paths', () => {
    expect(safeNextPath('/billing?x=1')).toBe('/billing?x=1')
    expect(safeNextPath('//evil.com')).toBeNull()
    expect(safeNextPath('/\\evil.com')).toBeNull()
    expect(safeNextPath('https://evil.com')).toBeNull()
    expect(safeNextPath('/login')).toBeNull()
    expect(safeNextPath(null)).toBeNull()
  })
})

describe('middleware', () => {
  it('redirects signed-out users to /login with next', () => {
    const res = run('/settings?tab=connections', false)
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/settings?tab=connections')
  })

  it('lets signed-out users see public pages', () => {
    for (const p of ['/', '/pricing', '/terms', '/privacy', '/login', '/queue/approved?status=approved']) {
      expect(run(p, false).headers.get('location'), p).toBeNull()
    }
  })

  it('never redirects API routes', () => {
    for (const p of ['/api/cron/autopilot', '/api/extension/whoami', '/api/drafts/approve?token=x', '/api/webhooks/razorpay']) {
      expect(run(p, false).headers.get('location'), p).toBeNull()
    }
  })

  it('sends signed-in users away from /login', () => {
    expect(new URL(run('/login', true).headers.get('location')!).pathname).toBe('/dashboard')
    expect(new URL(run('/login?next=/billing', true).headers.get('location')!).pathname).toBe('/billing')
    expect(new URL(run('/login?next=//evil.com', true).headers.get('location')!).href).toBe('https://app.test/dashboard')
  })

  it('lets signed-in users through to app pages', () => {
    expect(run('/dashboard', true).headers.get('location')).toBeNull()
    expect(run('/onboarding', true).headers.get('location')).toBeNull()
  })
})
