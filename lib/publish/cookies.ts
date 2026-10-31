/** Minimal cookie helpers for route handlers that build raw Responses. */

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge: number; path?: string; secure?: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? '/'}`,
    `Max-Age=${opts.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  if (setCookie) headers.append('Set-Cookie', setCookie)
  return new Response(null, { status: 302, headers })
}
