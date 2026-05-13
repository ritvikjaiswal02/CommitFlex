import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/webhooks']
const PUBLIC_EXACT = new Set(['/'])

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_EXACT.has(pathname) || PUBLIC_PATHS.some(p => pathname.startsWith(p))
  const isApi = pathname.startsWith('/api')

  if (!req.auth && !isPublic && !isApi) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (req.auth && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
