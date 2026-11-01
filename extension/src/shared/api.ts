import type { ApiError, Result } from './types'

/**
 * Minimal fetch wrapper for the token API. Always resolves: network failures,
 * non-JSON bodies and error statuses become ApiError values with a message
 * written for the person using the extension.
 */
export async function apiRequest<T>(
  appUrl: string,
  token: string,
  path: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
): Promise<Result<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000)
  let res: Response
  try {
    res = await fetch(`${appUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    return failure(
      0,
      aborted ? 'timeout' : 'network_error',
      aborted
        ? `${hostOf(appUrl)} took too long to answer. Try again in a moment.`
        : `Couldn't reach CommitFlex at ${hostOf(appUrl)}. Check your connection or the address in the extension's settings.`,
    )
  } finally {
    clearTimeout(timer)
  }

  let body: unknown = null
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (res.ok) return { ok: true, data: body as T }

  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code : defaultCode(res.status)
  const message = typeof record.error === 'string' && record.error ? record.error : defaultMessage(res.status)
  return failure(res.status, code, message, record)
}

function failure(status: number, code: string, error: string, body?: Record<string, unknown>): ApiError {
  return { ok: false, status, code, error, body }
}

function hostOf(appUrl: string): string {
  try {
    return new URL(appUrl).host
  } catch {
    return appUrl
  }
}

function defaultCode(status: number): string {
  if (status === 401) return 'unauthorized'
  if (status === 402) return 'payment_required'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limited'
  return status >= 500 ? 'internal_error' : 'request_failed'
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Your extension token was revoked or has expired. Connect the extension again.'
  if (status === 404) return 'CommitFlex could not find that. It may have been deleted.'
  if (status === 429) return 'Too many requests in a short time. Wait a minute and try again.'
  if (status >= 500) return 'CommitFlex hit an error. Try again in a moment.'
  return 'CommitFlex could not complete that request.'
}
