import { Resend } from 'resend'
import { render } from '@react-email/components'
import type { ReactElement } from 'react'

export interface SendEmailInput {
  to: string
  subject: string
  react: ReactElement
  /** Optional plaintext fallback. If omitted, derived from the rendered HTML. */
  text?: string
}

export interface SendEmailResult {
  ok: boolean
  providerMessageId?: string
  error?: string
  /** True when no provider was configured and the email was logged to stdout. */
  consoleOnly?: boolean
}

let _client: Resend | null = null
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!_client) _client = new Resend(key)
  return _client
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? 'CommitFlex <onboarding@resend.dev>'
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Send an email via Resend. When RESEND_API_KEY is absent, falls back to
 * console.log so dev/CI never crashes — the result includes `consoleOnly: true`
 * so callers can distinguish "delivered" from "stubbed".
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  let html: string
  try {
    html = await render(input.react)
  } catch (err) {
    return { ok: false, error: `Failed to render email: ${err instanceof Error ? err.message : String(err)}` }
  }
  const text = input.text ?? htmlToText(html)

  const client = getClient()
  if (!client) {
    // eslint-disable-next-line no-console
    console.log('[mailer:console]', {
      to: input.to,
      subject: input.subject,
      preview: text.slice(0, 200),
    })
    return { ok: true, consoleOnly: true }
  }

  try {
    const { data, error } = await client.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html,
      text,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, providerMessageId: data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
