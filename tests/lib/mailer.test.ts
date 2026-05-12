/**
 * Smoke-test the mailer's console-fallback path. We don't exercise the real
 * Resend network call here — that's covered by integration testing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { sendEmail } from '@/lib/mailer'

const originalKey = process.env.RESEND_API_KEY
let consoleLogSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  delete process.env.RESEND_API_KEY
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalKey
  consoleLogSpy.mockRestore()
})

describe('sendEmail (console fallback)', () => {
  it('returns consoleOnly:true when RESEND_API_KEY is unset', async () => {
    const result = await sendEmail({
      to: 'dev@example.com',
      subject: 'hello',
      react: React.createElement('div', null, 'Hi there friend, this is the body of the email.'),
    })
    expect(result.ok).toBe(true)
    expect(result.consoleOnly).toBe(true)
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('uses provided plaintext when given', async () => {
    await sendEmail({
      to: 'dev@example.com',
      subject: 'hello',
      react: React.createElement('div', null, 'HTML body'),
      text: 'PLAIN body',
    })
    const args = consoleLogSpy.mock.calls[0][1] as { preview: string }
    expect(args.preview).toContain('PLAIN body')
  })

  it('falls back to deriving plaintext from rendered HTML when text omitted', async () => {
    await sendEmail({
      to: 'dev@example.com',
      subject: 'hello',
      react: React.createElement('p', null, 'Hello there from a paragraph'),
    })
    const args = consoleLogSpy.mock.calls[0][1] as { preview: string }
    expect(args.preview).toContain('Hello there from a paragraph')
  })
})
