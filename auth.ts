import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db/client'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'

const useSecureCookies = process.env.NODE_ENV === 'production'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  trustHost: true,
  useSecureCookies,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: { scope: 'read:user user:email repo admin:repo_hook' },
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.sub = user.id
      return token
    },
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.sub! },
    }),
  },
})
