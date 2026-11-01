/**
 * Razorpay signature checks (HMAC-SHA256, hex), compared in constant time.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { optionalEnv } from '@/lib/env'

function hmacHex(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(received.trim().toLowerCase(), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Verifies the `X-Razorpay-Signature` header against the raw request body.
 * `secret` defaults to RAZORPAY_WEBHOOK_SECRET. Returns false when either the
 * signature or the secret is missing.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret?: string): boolean {
  const key = secret ?? optionalEnv('RAZORPAY_WEBHOOK_SECRET')
  if (!key || !signature) return false
  return safeEqualHex(hmacHex(rawBody, key), signature)
}

/**
 * Verifies the Checkout success handler's signature for a subscription:
 * HMAC_SHA256(`${paymentId}|${subscriptionId}`, RAZORPAY_KEY_SECRET).
 */
export function verifyCheckoutSignature(input: { paymentId: string; subscriptionId: string; signature: string }): boolean {
  const key = optionalEnv('RAZORPAY_KEY_SECRET')
  if (!key || !input.paymentId || !input.subscriptionId || !input.signature) return false
  return safeEqualHex(hmacHex(`${input.paymentId}|${input.subscriptionId}`, key), input.signature)
}
