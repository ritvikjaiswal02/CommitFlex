import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

/**
 * Database-free `auth()` for the Edge middleware. It reads the same JWT
 * session cookie as `@/auth`, without bundling the Drizzle adapter.
 */
export const { auth } = NextAuth(authConfig)
