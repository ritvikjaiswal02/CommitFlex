/**
 * Small helpers for the API error shape every route shares:
 * `{ error: string, code?: string, ...extra }` (BUILD_CONTRACTS §0.7).
 */
import type { ZodError } from 'zod'

export function apiError(status: number, code: string, error: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error, code, ...extra }, { status })
}

export function unauthorized(): Response {
  return apiError(401, 'unauthorized', 'Sign in to continue.')
}

export function notFound(what = 'That item'): Response {
  return apiError(404, 'not_found', `${what} was not found.`)
}

export function invalidRequest(err: ZodError, message?: string): Response {
  const first = err.issues[0]
  return apiError(400, 'invalid_request', message ?? first?.message ?? 'The request was not valid.', {
    issues: err.flatten(),
  })
}

/** Reads a JSON body; returns `fallback` for an empty or malformed body. */
export async function readJson(req: Request, fallback: unknown = null): Promise<unknown> {
  try {
    const text = await req.text()
    if (!text.trim()) return fallback
    return JSON.parse(text)
  } catch {
    return fallback
  }
}
