import NextAuth from 'next-auth'
import type { Adapter, AdapterAccount } from 'next-auth/adapters'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { authConfig } from '@/auth.config'
import { db } from '@/lib/db/client'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'
import { sealSecret } from '@/lib/auth/encrypt'
import { storeGithubAccessToken } from '@/lib/db/queries/integrations'

const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
}) as Adapter

/**
 * The GitHub token can read private repos and manage webhooks, so it is
 * stored encrypted (lib/auth/encrypt.ts sealSecret). getGithubAccessToken
 * decrypts it.
 */
const adapter: Adapter = {
  ...baseAdapter,
  linkAccount: (account: AdapterAccount) =>
    baseAdapter.linkAccount!({
      ...account,
      access_token: account.access_token ? sealSecret(account.access_token) : account.access_token,
      refresh_token: account.refresh_token ? sealSecret(account.refresh_token) : account.refresh_token,
    }),
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
  events: {
    // Auth.js only writes the token when the account is first linked; keep it
    // current (and encrypted) on every later sign-in too.
    async signIn({ account, isNewUser }) {
      if (isNewUser || !account || account.provider !== 'github' || !account.access_token) return
      try {
        await storeGithubAccessToken({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          accessToken: account.access_token,
          scope: account.scope ?? null,
        })
      } catch (err) {
        console.error('[auth] could not refresh the stored GitHub token', err)
      }
    },
  },
})
