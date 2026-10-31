import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { apiTokens, type ApiTokenRow } from '@/lib/db/schema'
import { generateApiToken } from '@/lib/auth/api-token'

export interface ApiTokenSummary {
  id: string
  name: string
  tokenPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
  expiresAt: string | null
}

export function toApiTokenSummary(row: ApiTokenRow): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }
}

function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  return (trimmed || 'Chrome extension').slice(0, 60)
}

/**
 * Creates a token and returns the plaintext once. Only the SHA-256 hash and a
 * short display prefix are stored. Plan limits are checked by the caller.
 */
export async function createApiToken(
  userId: string,
  name: string,
  scopes: string[] = ['extension'],
  opts?: { expiresAt?: Date | null },
): Promise<{ token: string; summary: ApiTokenSummary }> {
  const { token, hash, prefix } = generateApiToken()
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: cleanName(name),
      tokenHash: hash,
      tokenPrefix: prefix,
      scopes: scopes.length > 0 ? scopes : ['extension'],
      expiresAt: opts?.expiresAt ?? null,
    })
    .returning()
  return { token, summary: toApiTokenSummary(row) }
}

/** Non-revoked tokens, newest first. */
export async function listApiTokens(userId: string): Promise<ApiTokenSummary[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt))
  return rows.map(toApiTokenSummary)
}

/** Revokes one of the user's tokens. False when it doesn't exist, isn't theirs, or is already revoked. */
export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id })
  return rows.length > 0
}

/** Revokes every live token of the user. Returns how many were revoked. */
export async function revokeAllApiTokens(userId: string): Promise<number> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id })
  return rows.length
}

/** A token that is neither revoked nor expired, by hash. */
export async function findActiveTokenByHash(hash: string): Promise<ApiTokenRow | null> {
  const [row] = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, hash),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date())),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function touchApiToken(tokenId: string): Promise<void> {
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, tokenId))
}
