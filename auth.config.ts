import type { NextAuthConfig } from 'next-auth'
import GitHub from 'next-auth/providers/github'

/**
 * Edge-safe Auth.js config: everything except the database adapter.
 *
 * `middleware.ts` builds its `auth()` from this file alone (see auth.edge.ts),
 * so the Edge bundle never pulls in postgres or Drizzle. `auth.ts` spreads it
 * and adds the Drizzle adapter for the Node.js runtime (route handlers, pages).
 * Sessions are JWTs, so the middleware can read them without a database.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === 'production',
  // Our own sign-in screen. Auth errors (e.g. a cancelled GitHub consent)
  // land there too as /login?error=<type>.
  pages: { signIn: '/login', error: '/login' },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // repo: read private repos the user selects. admin:repo_hook: install the
      // push / pull_request / release webhook that powers autopilot.
      authorization: {
        params: { scope: 'read:user user:email repo admin:repo_hook' },
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user, profile }) => {
      if (user) token.sub = user.id
      // GitHub's profile carries the username; keep it for "Signed in as @login".
      const login = (profile as { login?: unknown } | undefined)?.login
      if (typeof login === 'string') token.login = login
      return token
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub!,
        login: typeof token.login === 'string' ? token.login : null,
      },
    }),
  },
} satisfies NextAuthConfig
