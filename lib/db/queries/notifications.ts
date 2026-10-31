import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userNotificationPreferences, emailLog, userProfiles, users } from '@/lib/db/schema'

export type NotificationPreferences = typeof userNotificationPreferences.$inferSelect

export interface NotificationPrefsPatch {
  emailOnComplete?: boolean
  weeklyDigest?: boolean
  productUpdates?: boolean
  approvalRequests?: boolean
  readyToPost?: boolean
  publishReceipts?: boolean
}

const DEFAULTS = {
  emailOnComplete: true,
  weeklyDigest: false,
  productUpdates: false,
  approvalRequests: true,
  readyToPost: true,
  publishReceipts: true,
}

/**
 * Returns the user's preferences row, creating defaults on first call so the
 * settings page never sees null. Callers can treat the return value as the
 * source of truth.
 */
export async function getPrefs(userId: string): Promise<NotificationPreferences> {
  const [row] = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1)
  if (row) return row
  const [created] = await db
    .insert(userNotificationPreferences)
    .values({ userId, ...DEFAULTS })
    .onConflictDoNothing()
    .returning()
  if (created) return created
  const [again] = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1)
  return again
}

export async function upsertPrefs(userId: string, patch: NotificationPrefsPatch): Promise<NotificationPreferences> {
  const existing = await getPrefs(userId)
  const merged = { ...existing, ...patch, updatedAt: new Date() }
  const [row] = await db
    .update(userNotificationPreferences)
    .set(merged)
    .where(eq(userNotificationPreferences.userId, userId))
    .returning()
  return row
}

/**
 * Idempotency check — if we've already sent this kind of email for this
 * job, don't send again. Used to make pipeline retries safe.
 */
export async function hasEmailedFor(jobId: string, kind: string): Promise<boolean> {
  const [row] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.jobId, jobId), eq(emailLog.kind, kind)))
    .limit(1)
  return !!row
}

/** True when an email of `kind` went to the user at or after `since`. */
export async function hasEmailedUserSince(userId: string, kind: string, since: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.userId, userId), eq(emailLog.kind, kind), gte(emailLog.sentAt, since)))
    .limit(1)
  return !!row
}

export async function logEmail(input: {
  userId: string
  jobId?: string | null
  kind: string
  deliveryStatus: 'sent' | 'failed' | 'console-only'
  providerMessageId?: string | null
  errorMessage?: string | null
}) {
  await db.insert(emailLog).values({
    userId: input.userId,
    jobId: input.jobId ?? null,
    kind: input.kind,
    deliveryStatus: input.deliveryStatus,
    providerMessageId: input.providerMessageId ?? null,
    errorMessage: input.errorMessage ?? null,
  })
}

export interface UserContact {
  id: string
  email: string
  name: string | null
  firstName: string
}

/**
 * Email and a friendly first name for transactional mail. The address set
 * during onboarding (user_profiles.notify_email) wins over the GitHub email,
 * which is missing or a noreply address for people with a private email.
 */
export async function getUserContact(userId: string): Promise<UserContact | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, notifyEmail: userProfiles.notifyEmail })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1)
  if (!row) return null
  const email = (row.notifyEmail?.trim() || row.email?.trim() || '').toLowerCase()
  if (!email || isUndeliverable(email)) return null
  const firstName = row.name?.trim().split(/\s+/)[0] || email.split('@')[0] || 'there'
  return { id: row.id, email, name: row.name, firstName }
}

/** GitHub's noreply addresses never reach a person. */
export function isUndeliverable(email: string): boolean {
  return /@users\.noreply\.github\.com$/i.test(email) || !email.includes('@')
}

/** The account's own (GitHub) email, ignoring notify_email. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
  return row?.email ?? null
}
