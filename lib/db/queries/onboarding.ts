import { createHash } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, subscriptions, trialClaims, userProfiles, type UserProfileRow } from '@/lib/db/schema'
import { TRIAL_DAYS } from '@/lib/billing/catalog'
import { AUDIENCE_VALUES, ROLE_PHRASES, isRole } from '@/components/onboarding/questions'

export type UserProfile = UserProfileRow

export type UserProfilePatchInput = Partial<Omit<UserProfileRow, 'userId' | 'createdAt'>>

const DAY_MS = 24 * 60 * 60 * 1000

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1)
  return row ?? null
}

/**
 * Inserts the profile row or merges `patch` into it. `updatedAt` is always
 * bumped. Undefined keys are ignored; pass `null` to clear a nullable column.
 */
export async function upsertUserProfile(userId: string, patch: UserProfilePatchInput): Promise<UserProfile> {
  const values: UserProfilePatchInput = {}
  for (const [key, value] of Object.entries(patch) as [keyof UserProfilePatchInput, unknown][]) {
    if (value !== undefined) (values as Record<string, unknown>)[key] = value
  }
  const now = new Date()
  const [row] = await db
    .insert(userProfiles)
    .values({ ...values, userId, updatedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { ...values, updatedAt: now },
    })
    .returning()
  return row
}

export function hashGithubAccountId(providerAccountId: string): string {
  return createHash('sha256').update(`github:${providerAccountId}`, 'utf8').digest('hex')
}

async function githubClaimHash(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ providerAccountId: accounts.providerAccountId })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
    .limit(1)
  return row?.providerAccountId ? hashGithubAccountId(row.providerAccountId) : null
}

/**
 * Starts the 14-day Pro trial once per GitHub account. Eligible when the
 * profile has never had a trial, the user has never had a subscription, and
 * the GitHub account never claimed a trial before (trial_claims survives
 * account deletion, so delete-and-sign-up-again doesn't grant a new one).
 * The update is conditional on `trial_ends_at IS NULL`, so concurrent calls
 * start it once. Returns the trial end, or null when the user isn't eligible.
 */
export async function startTrialIfEligible(userId: string, now: Date = new Date()): Promise<Date | null> {
  const existing = await getUserProfile(userId)
  if (existing?.trialEndsAt) return null

  const [anySubscription] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)
  if (anySubscription) return null

  const claimHash = await githubClaimHash(userId)
  if (claimHash) {
    const [claimed] = await db
      .select({ hash: trialClaims.githubAccountIdHash })
      .from(trialClaims)
      .where(eq(trialClaims.githubAccountIdHash, claimHash))
      .limit(1)
    if (claimed) return null
  }

  const trialEndsAt = await startTrialRow(userId, existing, now)
  if (trialEndsAt && claimHash) {
    await db.insert(trialClaims).values({ githubAccountIdHash: claimHash, claimedAt: now }).onConflictDoNothing()
  }
  return trialEndsAt
}

async function startTrialRow(userId: string, existing: UserProfile | null, now: Date): Promise<Date | null> {
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS)

  if (!existing) {
    const [created] = await db
      .insert(userProfiles)
      .values({ userId, trialEndsAt, updatedAt: now })
      .onConflictDoNothing({ target: userProfiles.userId })
      .returning({ trialEndsAt: userProfiles.trialEndsAt })
    if (created?.trialEndsAt) return created.trialEndsAt
    // Another request created the row first; fall through to the conditional update.
  }

  const [updated] = await db
    .update(userProfiles)
    .set({ trialEndsAt, updatedAt: now })
    .where(and(eq(userProfiles.userId, userId), isNull(userProfiles.trialEndsAt)))
    .returning({ trialEndsAt: userProfiles.trialEndsAt })
  return updated?.trialEndsAt ?? null
}

/**
 * One or two sentences of author context for the AI prompts, e.g.
 * "Author: indie founder building 'An open-source feature flag service'. Audience: developers, customers."
 * Returns '' when the profile has nothing useful to say.
 */
export function buildAuthorContext(profile: UserProfile | null): string {
  if (!profile) return ''
  const parts: string[] = []

  const role = isRole(profile.role) ? ROLE_PHRASES[profile.role] : null
  const pitch = profile.pitch?.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '') || null
  if (role && pitch) parts.push(`Author: ${role} building '${pitch}'.`)
  else if (role) parts.push(`Author: ${role}.`)
  else if (pitch) parts.push(`Author is building '${pitch}'.`)

  const audiences = (profile.audiences ?? []).filter((a) => (AUDIENCE_VALUES as readonly string[]).includes(a))
  if (audiences.length > 0) parts.push(`Audience: ${audiences.join(', ')}.`)

  return parts.join(' ')
}
