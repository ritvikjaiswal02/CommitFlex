/**
 * Social connections (LinkedIn today) and the GitHub OAuth account.
 * Access tokens are stored encrypted (lib/auth/encrypt.ts) and only decrypted
 * by the publisher at send time.
 */
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, socialConnections, users, type SocialConnectionRow } from '@/lib/db/schema'
import type { LinkedInConnectionSummary } from '@/types/autopilot'
import { openSecret, sealSecret } from '@/lib/auth/encrypt'

export async function getLinkedInConnection(userId: string): Promise<SocialConnectionRow | null> {
  const [row] = await db
    .select()
    .from(socialConnections)
    .where(and(eq(socialConnections.userId, userId), eq(socialConnections.provider, 'linkedin')))
    .limit(1)
  return row ?? null
}

/** Treats a passed `expires_at` as expired even before the cron flips the status. */
export function connectionStatus(row: Pick<SocialConnectionRow, 'status' | 'expiresAt'>, now: Date = new Date()) {
  if (row.status === 'revoked') return 'revoked' as const
  if (row.status === 'expired') return 'expired' as const
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired' as const
  return 'active' as const
}

export function toConnectionSummary(row: SocialConnectionRow, now: Date = new Date()): LinkedInConnectionSummary {
  return {
    status: connectionStatus(row, now),
    displayName: row.displayName ?? null,
    avatarUrl: row.avatarUrl ?? null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    connectedAt: row.connectedAt.toISOString(),
  }
}

export async function getLinkedInConnectionSummary(userId: string): Promise<LinkedInConnectionSummary | null> {
  const row = await getLinkedInConnection(userId)
  return row ? toConnectionSummary(row) : null
}

export async function upsertLinkedInConnection(input: {
  userId: string
  providerAccountId: string
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  accessTokenEnc: string
  refreshTokenEnc: string | null
  expiresAt: Date | null
  scopes: string[]
}): Promise<SocialConnectionRow> {
  const now = new Date()
  const values = {
    providerAccountId: input.providerAccountId,
    displayName: input.displayName,
    email: input.email,
    avatarUrl: input.avatarUrl,
    accessTokenEnc: input.accessTokenEnc,
    refreshTokenEnc: input.refreshTokenEnc,
    expiresAt: input.expiresAt,
    scopes: input.scopes,
    status: 'active',
    updatedAt: now,
  }
  const [row] = await db
    .insert(socialConnections)
    .values({ userId: input.userId, provider: 'linkedin', connectedAt: now, ...values })
    .onConflictDoUpdate({
      target: [socialConnections.userId, socialConnections.provider],
      set: { ...values, connectedAt: now },
    })
    .returning()
  return row
}

export async function setLinkedInStatus(userId: string, status: 'active' | 'expired' | 'revoked'): Promise<void> {
  await db
    .update(socialConnections)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(socialConnections.userId, userId), eq(socialConnections.provider, 'linkedin')))
}

export async function deleteLinkedInConnection(userId: string): Promise<SocialConnectionRow | null> {
  const [row] = await db
    .delete(socialConnections)
    .where(and(eq(socialConnections.userId, userId), eq(socialConnections.provider, 'linkedin')))
    .returning()
  return row ?? null
}

/** Active LinkedIn connections expiring between `from` and `to`, with the owner's email. */
export async function listExpiringLinkedInConnections(from: Date, to: Date) {
  return db
    .select({ connection: socialConnections, email: users.email, name: users.name })
    .from(socialConnections)
    .innerJoin(users, eq(users.id, socialConnections.userId))
    .where(
      and(
        eq(socialConnections.provider, 'linkedin'),
        eq(socialConnections.status, 'active'),
        gte(socialConnections.expiresAt, from),
        lte(socialConnections.expiresAt, to),
      ),
    )
}

/** Marks active connections whose token already expired. Returns how many changed. */
export async function expireStaleLinkedInConnections(now: Date): Promise<number> {
  const rows = await db
    .update(socialConnections)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(socialConnections.provider, 'linkedin'),
        eq(socialConnections.status, 'active'),
        lte(socialConnections.expiresAt, now),
      ),
    )
    .returning({ id: socialConnections.id })
  return rows.length
}

/** The user's GitHub OAuth account row (token and granted scopes). */
export async function getGithubAccount(userId: string) {
  const [row] = await db
    .select({
      accessToken: accounts.access_token,
      scope: accounts.scope,
      providerAccountId: accounts.providerAccountId,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
    .limit(1)
  return row ?? null
}

export async function getGithubAccessToken(userId: string): Promise<string | null> {
  const row = await getGithubAccount(userId)
  try {
    return openSecret(row?.accessToken)
  } catch (err) {
    console.error('[integrations] could not decrypt the GitHub token', err)
    return null
  }
}

/**
 * Stores the latest GitHub token, encrypted. Called on every sign-in, so a
 * re-authorised (or re-scoped) token replaces the old one.
 */
export async function storeGithubAccessToken(input: {
  provider: string
  providerAccountId: string
  accessToken: string
  scope?: string | null
}): Promise<void> {
  await db
    .update(accounts)
    .set({ access_token: sealSecret(input.accessToken), ...(input.scope ? { scope: input.scope } : {}) })
    .where(and(eq(accounts.provider, input.provider), eq(accounts.providerAccountId, input.providerAccountId)))
}
