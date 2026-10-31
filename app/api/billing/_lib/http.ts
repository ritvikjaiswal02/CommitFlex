import { checkRateLimit, resetMemoryRateLimits } from '@/lib/rate-limit'
/**
 * Small HTTP helpers shared by the billing routes and the Razorpay webhook.
 * Error bodies follow BUILD_CONTRACTS §0.7: `{ error, code?, ...extra }`.
 */
import type { ZodError } from 'zod'
import { auth } from '@/auth'

export function jsonError(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error, code, ...(extra ?? {}) }, { status })
}

export function unauthorized(): Response {
  return jsonError(401, 'unauthorized', 'Sign in to manage billing.')
}

export function invalidRequest(err: ZodError, message = 'The request body is not valid.'): Response {
  return jsonError(400, 'invalid_request', message, { issues: err.flatten() })
}

export interface SessionUser {
  id: string
  name: string | null
  email: string | null
}

/** The signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null
  return { id, name: session.user?.name ?? null, email: session.user?.email ?? null }
}

/** Reads a JSON body. An empty body is `{}`; malformed JSON is `null`. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text().catch(() => '')
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Fixed-window limiter for the checkout route, so a double click or a
 * scripted loop cannot create dozens of Razorpay subscriptions. Backed by
 * the shared limiter in lib/rate-limit.ts, so it holds across instances.
 */
export async function takeToken(key: string, max: number, windowMs: number): Promise<{ ok: boolean; retryAfter: number }> {
  const result = await checkRateLimit(key, { max, windowMs })
  if (result.allowed) return { ok: true, retryAfter: 0 }
  return { ok: false, retryAfter: Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)) }
}

/** Test hook: clears the limiter between test cases. */
export function resetRateLimits(): void {
  resetMemoryRateLimits()
}

export function rateLimited(retryAfter: number): Response {
  return Response.json(
    { error: 'Too many checkout attempts. Wait a minute and try again.', code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

/** ISO string or null. */
export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}
