import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appUrl, isConfigured, missingEnvFor, optionalEnv, requireEnv, webhookBaseUrl, linkedInApiVersion } from '@/lib/env'

const KEYS = [
  'APP_URL', 'NEXTAUTH_URL', 'VERCEL_URL', 'WEBHOOK_BASE_URL', 'CF_TEST_VAR',
  'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'OAUTH_TOKEN_ENCRYPTION_KEY',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RESEND_API_KEY', 'CRON_SECRET', 'ANTHROPIC_API_KEY',
  'LINKEDIN_API_VERSION',
]

describe('lib/env', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('treats empty strings as unset', () => {
    process.env.CF_TEST_VAR = '   '
    expect(optionalEnv('CF_TEST_VAR')).toBeUndefined()
    process.env.CF_TEST_VAR = ' value '
    expect(optionalEnv('CF_TEST_VAR')).toBe('value')
  })

  it('requireEnv throws only when called', () => {
    expect(() => requireEnv('CF_TEST_VAR')).toThrow('Missing env CF_TEST_VAR')
    process.env.CF_TEST_VAR = 'x'
    expect(requireEnv('CF_TEST_VAR')).toBe('x')
  })

  it('appUrl prefers APP_URL, then NEXTAUTH_URL, then VERCEL_URL, then localhost', () => {
    expect(appUrl()).toBe('http://localhost:3000')
    process.env.VERCEL_URL = 'commitflex-abc.vercel.app'
    expect(appUrl()).toBe('https://commitflex-abc.vercel.app')
    process.env.NEXTAUTH_URL = 'https://auth.example.com/'
    expect(appUrl()).toBe('https://auth.example.com')
    process.env.APP_URL = 'https://app.example.com///'
    expect(appUrl()).toBe('https://app.example.com')
  })

  it('webhookBaseUrl falls back to appUrl', () => {
    process.env.APP_URL = 'https://app.example.com'
    expect(webhookBaseUrl()).toBe('https://app.example.com')
    process.env.WEBHOOK_BASE_URL = 'https://tunnel.example.com/'
    expect(webhookBaseUrl()).toBe('https://tunnel.example.com')
  })

  it('isConfigured checks every variable an integration needs', () => {
    expect(isConfigured('linkedin')).toBe(false)
    process.env.LINKEDIN_CLIENT_ID = 'id'
    process.env.LINKEDIN_CLIENT_SECRET = 'secret'
    expect(isConfigured('linkedin')).toBe(false)
    expect(missingEnvFor('linkedin')).toEqual(['OAUTH_TOKEN_ENCRYPTION_KEY'])
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
    expect(isConfigured('linkedin')).toBe(true)

    expect(isConfigured('razorpay')).toBe(false)
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x'
    process.env.RAZORPAY_KEY_SECRET = ''
    expect(isConfigured('razorpay')).toBe(false)
    process.env.RAZORPAY_KEY_SECRET = 's'
    expect(isConfigured('razorpay')).toBe(true)

    expect(isConfigured('email')).toBe(false)
    expect(isConfigured('cron')).toBe(false)
    expect(isConfigured('anthropic')).toBe(false)
  })

  it('defaults the LinkedIn API version', () => {
    expect(linkedInApiVersion()).toBe('202510')
    process.env.LINKEDIN_API_VERSION = '202601'
    expect(linkedInApiVersion()).toBe('202601')
  })
})
