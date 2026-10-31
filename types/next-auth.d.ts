import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      /** GitHub username, when the session was created after it was recorded. */
      login?: string | null
    } & DefaultSession['user']
  }
}
