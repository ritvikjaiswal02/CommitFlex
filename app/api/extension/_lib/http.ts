/**
 * HTTP helpers for the token-authenticated extension API.
 *
 * Every token route answers OPTIONS with 204 and CORS headers, never reads
 * cookies, and returns the shared error shape `{ error, code?, ...extra }`.
 * The Chrome extension calls these routes from its own origin with
 * `Authorization: Bearer cfx_…`.
 */
import {
  API_TOKEN_CORS_HEADERS,
  apiTokenUnauthorized,
  authenticateApiToken,
  type ApiTokenContext,
} from '@/lib/auth/api-token'
import { planErrorToResponse } from '@/lib/plans'
import { queueErrorToResponse } from '@/lib/autopilot/queue'

export const EXTENSION_SCOPE = 'extension'

/** Merges the CORS headers into a response (or response init headers). */
function corsHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  for (const [key, value] of Object.entries(API_TOKEN_CORS_HEADERS)) headers.set(key, value)
  // Token responses are per-user and must never be cached by an intermediary.
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store')
  return headers
}

/** JSON response with CORS headers. */
export function corsJson(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, { ...init, headers: corsHeaders(init.headers) })
}

/** Re-wraps a response produced elsewhere (plan errors, queue errors) with CORS headers. */
export function withCors(res: Response): Response {
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: corsHeaders(res.headers),
  })
}

/** The 204 preflight answer for every token route. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export function corsError(status: number, code: string, error: string, extra?: Record<string, unknown>): Response {
  return corsJson({ error, code, ...extra }, { status })
}

export function notFound(error = 'Not found'): Response {
  return corsError(404, 'not_found', error)
}

/** Maps a thrown error to a CORS response: plan errors → 402, queue errors → their status, else 500. */
export function errorToCorsResponse(err: unknown, context: string): Response {
  const planRes = planErrorToResponse(err)
  if (planRes) return withCors(planRes)
  const queueRes = queueErrorToResponse(err)
  if (queueRes) return withCors(queueRes)
  console.error(`[extension] ${context} failed`, err)
  return corsError(500, 'internal_error', 'CommitFlex hit an error handling this request. Try again in a moment.')
}

/**
 * Authenticates the bearer token (scope `extension`) and runs the handler.
 * Unauthenticated requests get 401; thrown errors are mapped to CORS responses.
 */
export async function withExtensionToken(
  req: Request,
  context: string,
  handler: (ctx: ApiTokenContext) => Promise<Response>,
): Promise<Response> {
  let ctx: ApiTokenContext | null
  try {
    ctx = await authenticateApiToken(req, EXTENSION_SCOPE)
  } catch (err) {
    console.error('[extension] token lookup failed', err)
    return corsError(500, 'internal_error', 'CommitFlex could not check your extension token. Try again in a moment.')
  }
  if (!ctx) return withCors(apiTokenUnauthorized())
  try {
    return await handler(ctx)
  } catch (err) {
    return errorToCorsResponse(err, context)
  }
}

/** Reads a JSON body; an empty body is `{}`. Returns undefined when the body is not valid JSON. */
export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text()
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export { isUuid } from './ids'
