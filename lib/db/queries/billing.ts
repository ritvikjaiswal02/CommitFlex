import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  apiTokens,
  autopilotSettings,
  billingEvents,
  queueItems,
  repos,
  subscriptions,
  usageCounters,
  userProfiles,
  users,
  voiceSettings,
  type BillingEventRow,
  type SubscriptionRow,
} from '@/lib/db/schema'
import type { BillingInterval, Currency, LimitKey, PaidPlanId } from '@/lib/billing/catalog'
import { pickEntitled } from '@/lib/billing/entitlement'

/** Queue statuses that count toward the `queuedPosts` limit. */
export const QUEUED_STATUSES = ['pending_review', 'approved', 'scheduled', 'ready'] as const

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Every subscription row the user has ever had, newest first. */
export async function listSubscriptions(userId: string): Promise<SubscriptionRow[]> {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
}

/**
 * The subscription that currently grants the user a paid plan: authenticated,
 * active or pending, or cancelled with time left in the period. Team beats Pro.
 */
export async function getEntitledSubscription(userId: string): Promise<SubscriptionRow | null> {
  const rows = await listSubscriptions(userId)
  return pickEntitled(rows)
}

export async function getSubscriptionByRazorpayId(id: string): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.razorpaySubscriptionId, id))
    .limit(1)
  return row ?? null
}

export async function getSubscriptionById(id: string): Promise<SubscriptionRow | null> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1)
  return row ?? null
}

/** Records a checkout that has been created at Razorpay but not paid yet. */
export async function insertPendingSubscription(input: {
  userId: string
  plan: PaidPlanId
  interval: BillingInterval
  currency: Currency
  razorpaySubscriptionId: string
  razorpayPlanId: string
}): Promise<SubscriptionRow> {
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId: input.userId,
      provider: 'razorpay',
      plan: input.plan,
      interval: input.interval,
      currency: input.currency,
      status: 'created',
      razorpaySubscriptionId: input.razorpaySubscriptionId,
      razorpayPlanId: input.razorpayPlanId,
    })
    .returning()
  return row
}

export type SubscriptionInsert = typeof subscriptions.$inferInsert

/**
 * Inserts a full row (used when a webhook arrives for a checkout we never
 * saw). Two deliveries racing to create the same subscription: the loser
 * reads the winner's row instead of failing on the unique index.
 */
export async function insertSubscription(values: SubscriptionInsert): Promise<SubscriptionRow> {
  const [row] = await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoNothing({ target: subscriptions.razorpaySubscriptionId })
    .returning()
  if (row) return row
  const existing = await getSubscriptionByRazorpayId(values.razorpaySubscriptionId)
  if (!existing) throw new Error(`Subscription ${values.razorpaySubscriptionId} could not be created`)
  return existing
}

export async function updateSubscription(id: string, patch: Partial<SubscriptionRow>): Promise<SubscriptionRow> {
  // Never let a patch move a row to another user or change its identity.
  const { id: _id, userId: _userId, createdAt: _createdAt, ...rest } = patch
  void _id
  void _userId
  void _createdAt
  const [row] = await db
    .update(subscriptions)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning()
  if (!row) throw new Error(`Subscription ${id} not found`)
  return row
}

/** True when a users row exists. Guards webhook payloads whose notes name an unknown user. */
export async function userExists(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  return !!row
}

// ---------------------------------------------------------------------------
// Trial
// ---------------------------------------------------------------------------

/** Reads user_profiles.trial_ends_at. Null when there is no profile or no trial. */
export async function getTrialEndsAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ trialEndsAt: userProfiles.trialEndsAt })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
  return row?.trialEndsAt ?? null
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/**
 * Current usage for one limit. Counting rules (PRODUCT_SPEC §7):
 * - repos: connected repos where deleted_at is null
 * - generationsPerMonth: usage_counters for the period (metric 'generations')
 * - voiceProfiles: rows in voice_settings
 * - queuedPosts: queue_items in pending_review, approved, scheduled or ready
 * - extensionTokens: api_tokens that aren't revoked
 * - reviewers: length of autopilot_settings.reviewer_emails
 */
export async function countUsage(userId: string, key: LimitKey, period: string): Promise<number> {
  switch (key) {
    case 'repos': {
      const [row] = await db
        .select({ n: count() })
        .from(repos)
        .where(and(eq(repos.userId, userId), isNull(repos.deletedAt)))
      return Number(row?.n ?? 0)
    }
    case 'generationsPerMonth': {
      const [row] = await db
        .select({ n: usageCounters.count })
        .from(usageCounters)
        .where(
          and(
            eq(usageCounters.userId, userId),
            eq(usageCounters.period, period),
            eq(usageCounters.metric, 'generations'),
          ),
        )
        .limit(1)
      return Number(row?.n ?? 0)
    }
    case 'voiceProfiles': {
      const [row] = await db.select({ n: count() }).from(voiceSettings).where(eq(voiceSettings.userId, userId))
      return Number(row?.n ?? 0)
    }
    case 'queuedPosts': {
      const [row] = await db
        .select({ n: count() })
        .from(queueItems)
        .where(and(eq(queueItems.userId, userId), inArray(queueItems.status, [...QUEUED_STATUSES])))
      return Number(row?.n ?? 0)
    }
    case 'extensionTokens': {
      const [row] = await db
        .select({ n: count() })
        .from(apiTokens)
        .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      return Number(row?.n ?? 0)
    }
    case 'reviewers': {
      const [row] = await db
        .select({ emails: autopilotSettings.reviewerEmails })
        .from(autopilotSettings)
        .where(eq(autopilotSettings.userId, userId))
        .limit(1)
      return row?.emails?.length ?? 0
    }
    default: {
      const exhaustive: never = key
      throw new Error(`Unknown limit ${String(exhaustive)}`)
    }
  }
}

/** Atomic upsert on (user, period, metric). Returns the new count. */
export async function incrementUsageCounter(
  userId: string,
  metric: string,
  period: string,
  amount: number,
): Promise<number> {
  const now = new Date()
  const [row] = await db
    .insert(usageCounters)
    .values({ userId, period, metric, count: amount, updatedAt: now })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.period, usageCounters.metric],
      set: { count: sql`${usageCounters.count} + ${amount}`, updatedAt: now },
    })
    .returning({ count: usageCounters.count })
  return Number(row?.count ?? amount)
}

const PG_INT_MAX = 2_147_483_647

/**
 * Reserves `amount` against a monthly counter only if the result stays
 * within `max`, in one statement, so concurrent requests can't both pass a
 * check and then overshoot. Returns the new count, or null when the
 * reservation would exceed the limit (nothing is written then).
 */
export async function reserveUsageCounter(
  userId: string,
  metric: string,
  period: string,
  amount: number,
  max: number,
): Promise<number | null> {
  const cap = Number.isFinite(max) ? Math.min(Math.floor(max), PG_INT_MAX) : PG_INT_MAX
  if (amount > cap) return null
  const rows = (await db.execute(sql`
    insert into usage_counters (user_id, period, metric, count, updated_at)
    values (${userId}, ${period}, ${metric}, ${amount}, now())
    on conflict (user_id, period, metric) do update
      set count = usage_counters.count + excluded.count, updated_at = now()
      where usage_counters.count + excluded.count <= ${cap}
    returning count
  `)) as unknown as { count: number | string }[]
  const row = rows[0]
  return row ? Number(row.count) : null
}

/** Gives back part of a reservation (the work it paid for didn't happen). */
export async function releaseUsageCounter(userId: string, metric: string, period: string, amount: number): Promise<void> {
  if (amount <= 0) return
  await db
    .update(usageCounters)
    .set({ count: sql`greatest(${usageCounters.count} - ${amount}, 0)`, updatedAt: new Date() })
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, period), eq(usageCounters.metric, metric)))
}

// ---------------------------------------------------------------------------
// Webhook event log (idempotency)
// ---------------------------------------------------------------------------

/**
 * Inserts the event unless (provider, event_id) already exists.
 * Returns the row and whether it was newly created.
 */
export async function recordBillingEvent(input: {
  eventId: string
  type: string
  payload: Record<string, unknown>
  userId?: string | null
}): Promise<{ row: BillingEventRow; created: boolean }> {
  const [inserted] = await db
    .insert(billingEvents)
    .values({
      provider: 'razorpay',
      eventId: input.eventId,
      type: input.type,
      payload: input.payload,
      userId: input.userId ?? null,
    })
    .onConflictDoNothing({ target: [billingEvents.provider, billingEvents.eventId] })
    .returning()
  if (inserted) return { row: inserted, created: true }
  const [existing] = await db
    .select()
    .from(billingEvents)
    .where(and(eq(billingEvents.provider, 'razorpay'), eq(billingEvents.eventId, input.eventId)))
    .limit(1)
  if (!existing) throw new Error(`Billing event ${input.eventId} could not be recorded`)
  return { row: existing, created: false }
}

/**
 * Claims an event for processing. Only one delivery at a time gets `true`;
 * a claim older than two minutes is treated as a crashed worker and can be
 * taken over by Razorpay's next retry.
 */
export async function claimBillingEvent(id: string): Promise<boolean> {
  const rows = await db
    .update(billingEvents)
    .set({ processingStartedAt: new Date() })
    .where(
      and(
        eq(billingEvents.id, id),
        isNull(billingEvents.processedAt),
        or(
          isNull(billingEvents.processingStartedAt),
          sql`${billingEvents.processingStartedAt} < now() - interval '2 minutes'`,
        ),
      ),
    )
    .returning({ id: billingEvents.id })
  return rows.length > 0
}

/**
 * Records the outcome of processing an event. `processed` defaults to "no
 * error"; an unprocessed event is retried when Razorpay redelivers it.
 */
export async function markBillingEventProcessed(
  id: string,
  result: { userId?: string | null; error?: string | null; processed?: boolean },
): Promise<void> {
  const processed = result.processed ?? !result.error
  await db
    .update(billingEvents)
    .set({
      processedAt: processed ? new Date() : null,
      // An unprocessed event releases its claim so Razorpay's retry can take it.
      ...(processed ? {} : { processingStartedAt: null }),
      error: result.error ?? null,
      ...(result.userId !== undefined ? { userId: result.userId } : {}),
    })
    .where(eq(billingEvents.id, id))
}

// ---------------------------------------------------------------------------
// Downgrade enforcement helpers
// ---------------------------------------------------------------------------

/** Repos with autopilot on, oldest connection first. */
export async function listAutopilotRepos(userId: string): Promise<{ id: string; connectedAt: Date }[]> {
  return db
    .select({ id: repos.id, connectedAt: repos.connectedAt })
    .from(repos)
    .where(and(eq(repos.userId, userId), isNull(repos.deletedAt), eq(repos.autopilotEnabled, true)))
    .orderBy(repos.connectedAt)
}

export async function disableRepoAutopilot(repoIds: string[]): Promise<void> {
  if (repoIds.length === 0) return
  await db.update(repos).set({ autopilotEnabled: false }).where(inArray(repos.id, repoIds))
}

/** Switches auto-approve back to review (used when a plan loses the feature). */
export async function forceReviewApprovalMode(userId: string): Promise<boolean> {
  const rows = await db
    .update(autopilotSettings)
    .set({ approvalMode: 'review', updatedAt: new Date() })
    .where(and(eq(autopilotSettings.userId, userId), eq(autopilotSettings.approvalMode, 'auto')))
    .returning({ userId: autopilotSettings.userId })
  return rows.length > 0
}

/** Users with a subscription whose paid period ended between `from` and `to`. */
export async function listSubscriptionUsersEndedBetween(from: Date, to: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(and(gte(subscriptions.currentPeriodEnd, from), lte(subscriptions.currentPeriodEnd, to)))
    .limit(1000)
  return rows.map((r) => r.userId)
}
