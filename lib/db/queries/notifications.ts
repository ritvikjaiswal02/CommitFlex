import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userNotificationPreferences, emailLog } from '@/lib/db/schema'

export type NotificationPreferences = typeof userNotificationPreferences.$inferSelect

const DEFAULTS = {
  emailOnComplete: true,
  weeklyDigest: false,
  productUpdates: false,
}

/**
 * Returns the user's preferences row, creating defaults on first call so the
 * settings page never sees null. Callers can treat the return value as the
 * source of truth.
 */
export async function getPrefs(userId: string): Promise<NotificationPreferences> {
  const [row] = await db.select().from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId)).limit(1)
  if (row) return row
  const [created] = await db.insert(userNotificationPreferences)
    .values({ userId, ...DEFAULTS })
    .returning()
  return created
}

export async function upsertPrefs(userId: string, patch: Partial<{
  emailOnComplete: boolean
  weeklyDigest: boolean
  productUpdates: boolean
}>): Promise<NotificationPreferences> {
  const existing = await getPrefs(userId)
  const merged = { ...existing, ...patch, updatedAt: new Date() }
  const [row] = await db.update(userNotificationPreferences)
    .set(merged)
    .where(eq(userNotificationPreferences.userId, userId))
    .returning()
  return row
}

/**
 * Idempotency check — if we've already sent this kind of email for this
 * (user, job) pair, don't send again. Used to make pipeline retries safe.
 */
export async function hasEmailedFor(jobId: string, kind: string): Promise<boolean> {
  const [row] = await db.select({ id: emailLog.id }).from(emailLog)
    .where(and(eq(emailLog.jobId, jobId), eq(emailLog.kind, kind)))
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
