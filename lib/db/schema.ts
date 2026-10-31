import { sql } from 'drizzle-orm'
import {
  pgTable, text, varchar, boolean, integer, bigint,
  timestamp, uuid, jsonb, numeric, primaryKey, index, uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * What the onboarding prefetch stores on a job: the fetch and summarise
 * stages run while the user is still answering questions, so `/complete`
 * only has to write the narrative and the posts.
 */
export interface JobPrefetch {
  summaries: { sha: string; summary: string; tags: string[]; significance: number }[]
  sourceContext: string | null
  commitCount: number
  finishedAt: string
}

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable('accounts', {
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) }))

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable('verificationToken', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }))

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  url: varchar('url', { length: 500 }),
  defaultBranch: varchar('default_branch', { length: 255 }).notNull().default('main'),
  isPrivate: boolean('is_private').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  preferredPlatforms: text('preferred_platforms').array().notNull().default(['linkedin', 'twitter']),
  postingFrequency: varchar('posting_frequency', { length: 50 }).notNull().default('weekly'),
  githubInstallationId: bigint('github_installation_id', { mode: 'number' }),
  repoOwnerType: varchar('repo_owner_type', { length: 10 }).notNull().default('user'),
  lastAnalyzedCommitSha: varchar('last_analyzed_commit_sha', { length: 40 }),
  webhookSecret: text('webhook_secret'),
  webhookId: bigint('webhook_id', { mode: 'number' }),
  autoGenerate: boolean('auto_generate').notNull().default(true),
  // Autopilot: ship moments and digests only fire for repos with this on.
  // Downgrades flip it off for repos beyond the plan's limit (never deleted).
  autopilotEnabled: boolean('autopilot_enabled').notNull().default(true),
  // Events the installed GitHub webhook subscribes to. Repos connected before
  // autopilot only have 'push'; the repositories page offers an upgrade.
  webhookEvents: text('webhook_events').array().notNull().default(['push']),
  connectedAt: timestamp('connected_at', { mode: 'date' }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => ({ userIdx: index('repos_user_idx').on(t.userId) }))

export const voiceSettings = pgTable('voice_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Multiple profiles per user — was unique, now indexed only. The
  // "default" profile is the one used at generation time; users can switch
  // it from the settings UI or the dashboard picker.
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull().default('Default'),
  isDefault: boolean('is_default').notNull().default(true),
  tone: varchar('tone', { length: 50 }).notNull().default('professional'),
  technicalLevel: integer('technical_level').notNull().default(7),
  audience: varchar('audience', { length: 100 }).notNull().default('developers'),
  extraContext: text('extra_context'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('voice_profiles_user_idx').on(t.userId),
}))

export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 30 }).notNull().default('queued'),
  commitCount: integer('commit_count').notNull().default(0),
  filteredCount: integer('filtered_count').notNull().default(0),
  // Origin of the commits we're summarising. 'window' is the classic date range,
  // 'pr' targets a single pull request, 'release' compares against the prior tag.
  sourceType: varchar('source_type', { length: 20 }).notNull().default('window'),
  // Free-form ref: PR URL when sourceType='pr', release tag name when 'release'.
  sourceRef: text('source_ref'),
  // What started this job:
  // 'manual'|'push'|'pr_merged'|'release_published'|'weekly_digest'|'cadence'|'extension'|'onboarding'
  trigger: varchar('trigger', { length: 30 }).notNull().default('manual'),
  voiceProfileId: uuid('voice_profile_id').references(() => voiceSettings.id, { onDelete: 'set null' }),
  // When true, drafts are enqueued into the autopilot queue on completion.
  autoQueue: boolean('auto_queue').notNull().default(false),
  // Onboarding prefetch result (status 'prefetched'); null for every other job.
  prefetch: jsonb('prefetch').$type<JobPrefetch>(),
  // True while an onboarding prefetch waits for the user's answers. Whoever
  // flips the job from 'prefetched' to writing (the prefetch run or
  // /api/onboarding/complete) does so with a conditional update, once.
  awaitingInput: boolean('awaiting_input').notNull().default(false),
  windowStart: timestamp('window_start', { mode: 'date' }).notNull(),
  windowEnd: timestamp('window_end', { mode: 'date' }).notNull(),
  retryCount: integer('retry_count').notNull().default(0),
  totalDurationMs: integer('total_duration_ms'),
  errorMessage: text('error_message'),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  userCreatedIdx: index('jobs_user_created_idx').on(t.userId, t.createdAt),
  // At most one live job per repo. Two webhooks (or the cron and a manual
  // run) racing to start a job: the second insert fails with 23505.
  activeRepoUidx: uniqueIndex('generation_jobs_active_repo_uidx')
    .on(t.repoId)
    .where(sql`status NOT IN ('completed', 'partial_completed', 'failed', 'cancelled')`),
}))

export const commitSnapshots = pgTable('commit_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  commitSha: varchar('commit_sha', { length: 40 }).notNull(),
  message: text('message').notNull(),
  author: varchar('author', { length: 255 }).notNull(),
  committedAt: timestamp('committed_at', { mode: 'date' }).notNull(),
  diffSummary: text('diff_summary'),
  includedInGeneration: boolean('included_in_generation').notNull().default(false),
}, (t) => ({ jobIdx: index('snapshots_job_idx').on(t.jobId) }))

export const commitSummaries = pgTable('commit_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  headline: varchar('headline', { length: 500 }).notNull(),
  keyChanges: jsonb('key_changes').notNull().$type<string[]>(),
  technicalDetails: text('technical_details').notNull(),
  buildContext: text('build_context').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const extractedNarratives = pgTable('extracted_narratives', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  summaryId: uuid('summary_id').references(() => commitSummaries.id),
  story: text('story').notNull(),
  angle: varchar('angle', { length: 255 }).notNull(),
  targetAudience: varchar('target_audience', { length: 255 }).notNull(),
  keyInsights: jsonb('key_insights').notNull().$type<string[]>(),
  suggestedHook: text('suggested_hook').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const postDrafts = pgTable('post_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  narrativeId: uuid('narrative_id').references(() => extractedNarratives.id),
  summaryId: uuid('summary_id').references(() => commitSummaries.id),
  generationModel: varchar('generation_model', { length: 100 }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('generated'),
  title: text('title'),
  hook: text('hook'),
  originalContent: text('original_content').notNull(),
  editedContent: text('edited_content'),
  editedAt: timestamp('edited_at', { mode: 'date' }),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  generationStage: varchar('generation_stage', { length: 50 }).notNull(),
  platformMetadata: jsonb('platform_metadata').notNull().$type<Record<string, unknown>>(),
  regenerationCount: integer('regeneration_count').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => ({
  jobIdx: index('drafts_job_idx').on(t.jobId),
  hashIdx: index('drafts_hash_idx').on(t.contentHash),
}))

export const aiGenerationLogs = pgTable('ai_generation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  stage: varchar('stage', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  promptVersion: varchar('prompt_version', { length: 50 }).notNull(),
  promptCommitHash: varchar('prompt_commit_hash', { length: 40 }),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  promptText: text('prompt_text').notNull(),
  outputText: text('output_text').notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 }),
  durationMs: integer('duration_ms').notNull(),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ jobIdx: index('logs_job_idx').on(t.jobId) }))

export const userNotificationPreferences = pgTable('user_notification_preferences', {
  userId: text('userId').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailOnComplete: boolean('email_on_complete').notNull().default(true),
  weeklyDigest: boolean('weekly_digest').notNull().default(false),
  productUpdates: boolean('product_updates').notNull().default(false),
  approvalRequests: boolean('approval_requests').notNull().default(true),
  readyToPost: boolean('ready_to_post').notNull().default(true),
  publishReceipts: boolean('publish_receipts').notNull().default(true),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const emailLog = pgTable('email_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
  kind: varchar('kind', { length: 50 }).notNull(),
  sentAt: timestamp('sent_at', { mode: 'date' }).notNull().defaultNow(),
  deliveryStatus: varchar('delivery_status', { length: 30 }).notNull().default('queued'),
  providerMessageId: text('provider_message_id'),
  errorMessage: text('error_message'),
}, (t) => ({
  userKindIdx: index('email_log_user_kind_idx').on(t.userId, t.kind),
  jobKindIdx: index('email_log_job_kind_idx').on(t.jobId, t.kind),
}))

export const pipelineEvents = pgTable('pipeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  correlationId: varchar('correlation_id', { length: 36 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  stage: varchar('stage', { length: 50 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  jobIdx: index('events_job_idx').on(t.jobId),
  corrIdx: index('events_corr_idx').on(t.correlationId),
}))

// ---------------------------------------------------------------------------
// Autopilot: profile, settings, queue, ship moments
// ---------------------------------------------------------------------------

export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }), // founder|engineer|maintainer|freelancer|student|devrel
  pitch: varchar('pitch', { length: 160 }),
  audiences: text('audiences').array().notNull().default([]), // developers|recruiters|customers|founders|users
  platforms: text('platforms').array().notNull().default(['linkedin', 'twitter']),
  tonePreset: varchar('tone_preset', { length: 30 }), // plain_technical|story_led|confident_founder|teacher|casual
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  country: varchar('country', { length: 2 }),
  // repos|role|audience|platforms|voice|cadence|done
  onboardingStep: varchar('onboarding_step', { length: 30 }).notNull().default('repos'),
  onboardedAt: timestamp('onboarded_at', { mode: 'date' }),
  // Where approval emails go when it differs from (or replaces a missing) GitHub email.
  notifyEmail: varchar('notify_email', { length: 255 }),
  trialEndsAt: timestamp('trial_ends_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const autopilotSettings = pgTable('autopilot_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  // ship_moments|weekly|twice_weekly|three_weekly|weekdays
  cadence: varchar('cadence', { length: 20 }).notNull().default('ship_moments'),
  postDays: integer('post_days').array().notNull().default([2, 4]), // 0=Sun … 6=Sat
  postTime: varchar('post_time', { length: 5 }).notNull().default('09:00'), // HH:MM, profile timezone
  // pr_merged|release_published|weekly_digest|push_window
  triggers: text('triggers').array().notNull().default(['pr_merged', 'release_published', 'weekly_digest']),
  platforms: text('platforms').array().notNull().default(['linkedin', 'twitter']),
  approvalMode: varchar('approval_mode', { length: 10 }).notNull().default('review'), // review|auto
  reviewerEmails: text('reviewer_emails').array().notNull().default([]),
  defaultVoiceProfileId: uuid('default_voice_profile_id').references(() => voiceSettings.id, { onDelete: 'set null' }),
  pausedUntil: timestamp('paused_until', { mode: 'date' }),
  lastPlannedAt: timestamp('last_planned_at', { mode: 'date' }),
  lastDigestAt: timestamp('last_digest_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const queueItems = pgTable('queue_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  draftId: uuid('draft_id').notNull().references(() => postDrafts.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'set null' }),
  platform: varchar('platform', { length: 20 }).notNull(), // linkedin|twitter
  // pending_review|approved|scheduled|ready|publishing|published|failed|skipped
  status: varchar('status', { length: 20 }).notNull().default('pending_review'),
  scheduledFor: timestamp('scheduled_for', { mode: 'date' }),
  approvedAt: timestamp('approved_at', { mode: 'date' }),
  approvedBy: varchar('approved_by', { length: 255 }), // email or 'owner' or 'auto'
  publishedAt: timestamp('published_at', { mode: 'date' }),
  publishMethod: varchar('publish_method', { length: 20 }), // linkedin_api|x_intent|extension|manual
  externalPostId: text('external_post_id'),
  externalUrl: text('external_url'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }),
  lastError: text('last_error'),
  reminderSentAt: timestamp('reminder_sent_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  draftUidx: uniqueIndex('queue_items_draft_uidx').on(t.draftId),
  userSchedIdx: index('queue_items_user_sched_idx').on(t.userId, t.scheduledFor),
  statusSchedIdx: index('queue_items_status_sched_idx').on(t.status, t.scheduledFor),
}))

export const approvalTokens = pgTable('approval_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  queueItemId: uuid('queue_item_id').notNull().references(() => queueItems.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(), // sha256 hex
  email: varchar('email', { length: 255 }).notNull(),
  // What this link may do. Owners get approve/skip/posted as needed; Team
  // reviewers only ever get approve.
  actions: text('actions').array().notNull().default(['approve']),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ hashUidx: uniqueIndex('approval_tokens_hash_uidx').on(t.tokenHash) }))

export const shipEvents = pgTable('ship_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 30 }).notNull(), // pr_merged|release_published|push
  externalId: varchar('external_id', { length: 100 }).notNull(), // PR number | release id | YYYY-MM-DD for push
  title: text('title').notNull(),
  url: text('url'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(), // e.g. { additions, deletions, skipped: 'limit_reached' }
  jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  dedupeUidx: uniqueIndex('ship_events_dedupe_uidx').on(t.repoId, t.kind, t.externalId),
  userCreatedIdx: index('ship_events_user_created_idx').on(t.userId, t.createdAt),
}))

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export const socialConnections = pgTable('social_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(), // linkedin
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(), // LinkedIn OIDC `sub`
  displayName: varchar('display_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  avatarUrl: text('avatar_url'),
  accessTokenEnc: text('access_token_enc').notNull(), // encrypt() from lib/auth/encrypt.ts
  refreshTokenEnc: text('refresh_token_enc'),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  scopes: text('scopes').array().notNull().default([]),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active|expired|revoked
  connectedAt: timestamp('connected_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ userProviderUidx: uniqueIndex('social_connections_user_provider_uidx').on(t.userId, t.provider) }))

export const publishLog = pgTable('publish_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  queueItemId: uuid('queue_item_id').references(() => queueItems.id, { onDelete: 'set null' }),
  draftId: uuid('draft_id').references(() => postDrafts.id, { onDelete: 'set null' }),
  platform: varchar('platform', { length: 20 }).notNull(),
  method: varchar('method', { length: 20 }).notNull(),
  // null = intent recorded before the API call, outcome not known yet. A
  // reclaimed 'publishing' item with an open intent is never re-posted.
  success: boolean('success'),
  statusCode: integer('status_code'),
  externalPostId: text('external_post_id'),
  error: text('error'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ userCreatedIdx: index('publish_log_user_created_idx').on(t.userId, t.createdAt) }))

// ---------------------------------------------------------------------------
// Billing and usage
// ---------------------------------------------------------------------------

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull().default('razorpay'),
  plan: varchar('plan', { length: 20 }).notNull(), // pro|team
  interval: varchar('interval', { length: 10 }).notNull(), // month|year
  currency: varchar('currency', { length: 3 }).notNull(), // INR|USD
  // created|authenticated|active|pending|halted|cancelled|completed|paused|expired
  status: varchar('status', { length: 20 }).notNull().default('created'),
  razorpaySubscriptionId: varchar('razorpay_subscription_id', { length: 64 }).notNull(),
  razorpayPlanId: varchar('razorpay_plan_id', { length: 64 }).notNull(),
  razorpayCustomerId: varchar('razorpay_customer_id', { length: 64 }),
  lastPaymentId: varchar('last_payment_id', { length: 64 }),
  currentPeriodStart: timestamp('current_period_start', { mode: 'date' }),
  currentPeriodEnd: timestamp('current_period_end', { mode: 'date' }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  cancelledAt: timestamp('cancelled_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  rzpSubUidx: uniqueIndex('subscriptions_rzp_sub_uidx').on(t.razorpaySubscriptionId),
  userIdx: index('subscriptions_user_idx').on(t.userId),
}))

export const billingEvents = pgTable('billing_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 20 }).notNull().default('razorpay'),
  eventId: varchar('event_id', { length: 100 }).notNull(), // x-razorpay-event-id
  type: varchar('type', { length: 60 }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp('processed_at', { mode: 'date' }),
  // Claimed by one webhook delivery at a time (concurrent redeliveries back off).
  processingStartedAt: timestamp('processing_started_at', { mode: 'date' }),
  error: text('error'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ eventUidx: uniqueIndex('billing_events_event_uidx').on(t.provider, t.eventId) }))

export const usageCounters = pgTable('usage_counters', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 7 }).notNull(), // 'YYYY-MM' (UTC)
  metric: varchar('metric', { length: 40 }).notNull(), // 'generations'
  count: integer('count').notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.period, t.metric] }) }))

/**
 * One row per GitHub account that has ever had a trial. Not tied to users,
 * so deleting the account and signing in again does not grant a new trial.
 * Only a SHA-256 of the GitHub account id is kept.
 */
export const trialClaims = pgTable('trial_claims', {
  githubAccountIdHash: varchar('github_account_id_hash', { length: 64 }).primaryKey(),
  claimedAt: timestamp('claimed_at', { mode: 'date' }).notNull().defaultNow(),
})

/** Fixed-window rate limit counters shared by every serverless instance. */
export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  key: varchar('key', { length: 200 }).primaryKey(),
  count: integer('count').notNull().default(0),
  resetAt: timestamp('reset_at', { mode: 'date' }).notNull(),
}, (t) => ({ resetIdx: index('rate_limit_buckets_reset_idx').on(t.resetAt) }))

// ---------------------------------------------------------------------------
// Personal access tokens (Chrome extension)
// ---------------------------------------------------------------------------

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(), // 'cfx_' + first 8 chars, for display
  scopes: text('scopes').array().notNull().default(['extension']),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  revokedAt: timestamp('revoked_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  hashUidx: uniqueIndex('api_tokens_hash_uidx').on(t.tokenHash),
  userIdx: index('api_tokens_user_idx').on(t.userId),
}))

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type RepoRow = typeof repos.$inferSelect
export type GenerationJobRow = typeof generationJobs.$inferSelect
export type PostDraftRow = typeof postDrafts.$inferSelect
export type UserProfileRow = typeof userProfiles.$inferSelect
export type AutopilotSettingsRow = typeof autopilotSettings.$inferSelect
export type QueueItemRow = typeof queueItems.$inferSelect
export type ApprovalTokenRow = typeof approvalTokens.$inferSelect
export type ShipEventRow = typeof shipEvents.$inferSelect
export type SocialConnectionRow = typeof socialConnections.$inferSelect
export type PublishLogRow = typeof publishLog.$inferSelect
export type SubscriptionRow = typeof subscriptions.$inferSelect
export type BillingEventRow = typeof billingEvents.$inferSelect
export type UsageCounterRow = typeof usageCounters.$inferSelect
export type ApiTokenRow = typeof apiTokens.$inferSelect
export type TrialClaimRow = typeof trialClaims.$inferSelect
