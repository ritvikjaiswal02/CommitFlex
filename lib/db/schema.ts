import {
  pgTable, text, varchar, boolean, integer, bigint,
  timestamp, uuid, jsonb, numeric, primaryKey, index,
} from 'drizzle-orm/pg-core'

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
  connectedAt: timestamp('connected_at', { mode: 'date' }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => ({ userIdx: index('repos_user_idx').on(t.userId) }))

export const voiceSettings = pgTable('voice_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  tone: varchar('tone', { length: 50 }).notNull().default('professional'),
  technicalLevel: integer('technical_level').notNull().default(7),
  audience: varchar('audience', { length: 100 }).notNull().default('developers'),
  extraContext: text('extra_context'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 30 }).notNull().default('queued'),
  commitCount: integer('commit_count').notNull().default(0),
  filteredCount: integer('filtered_count').notNull().default(0),
  windowStart: timestamp('window_start', { mode: 'date' }).notNull(),
  windowEnd: timestamp('window_end', { mode: 'date' }).notNull(),
  retryCount: integer('retry_count').notNull().default(0),
  totalDurationMs: integer('total_duration_ms'),
  errorMessage: text('error_message'),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ userCreatedIdx: index('jobs_user_created_idx').on(t.userId, t.createdAt) }))

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
