import { auth } from '@/auth.edge'
import { NextResponse } from 'next/server'

/**
 * Page access only. API routes are never redirected: each one authenticates
 * itself (session, extension token, cron secret, HMAC or approval token).
 * No database access here; the onboarding gate lives in the pages.
 */

/** Exact public pages. */
const PUBLIC_EXACT = new Set(['/', '/login'])

/** Public sections (the path itself and anything below it). */
const PUBLIC_PREFIXES = ['/pricing', '/terms', '/privacy', '/queue/approved']

/** Metadata routes Next.js generates; crawlers and link unfurlers fetch these signed out. */
const PUBLIC_METADATA = [
  '/opengraph-image',
  '/twitter-image',
  '/icon',
  '/apple-icon',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
]

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  const underPrefix = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  return PUBLIC_PREFIXES.some(underPrefix) || PUBLIC_METADATA.some(underPrefix)
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

/** Only same-origin relative paths are allowed as a post-login destination. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return null
  return value
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl

  if (isApiPath(pathname)) return NextResponse.next()

  const signedIn = !!req.auth?.user

  if (pathname === '/login') {
    if (signedIn) {
      const next = safeNextPath(req.nextUrl.searchParams.get('next'))
      return NextResponse.redirect(new URL(next ?? '/dashboard', req.url))
    }
    return NextResponse.next()
  }

  if (!signedIn && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  // Skip Next internals and static files served from /public.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff|woff2|ttf|css|map|zip)$).*)',
  ],
}
