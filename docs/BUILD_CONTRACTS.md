# CommitFlex build contracts

Every builder must follow this document. Builders work in parallel and only see this document, `docs/PRODUCT_SPEC.md` and the code. If you need something that belongs to another package, import it exactly as written here and assume it exists. Do not create your own copy. If this document is silent on something inside your own package, decide it yourself and keep it inside your files.

---

## 0. Ground rules

1. **File ownership is exclusive** (section 1). Only edit paths you own. If you depend on an export that isn't written yet, import it as specified. The orchestrator checks the build after every package lands.
2. **No git state changes.** No dev servers. Use timeouts on commands. Never write real secrets. Read env vars only through `lib/env.ts` helpers or `process.env`.
3. **Stack facts:** Next.js **14.2** App Router (route `params` are plain objects, not promises, and there is no `after()`), React 18, TypeScript strict, **Tailwind CSS 3.4** (not v4), `@base-ui/react` 1.4 for primitives, `lucide-react` 1.x for icons (it has **no brand icons**, so use `components/brand/platform.tsx` for GitHub, LinkedIn and X), `motion` 12 (import from `motion/react`), zod 4, Drizzle 0.45, Vitest 4 with jsdom.
4. **Tailwind 3 syntax only.** Write `data-[open]:`, `data-[starting-style]:`, `data-[ending-style]:`, `data-[highlighted]:`, `data-[checked]:`, `data-[disabled]:`, `aria-[invalid=true]:`, `ring-2`, `has-[>svg]:`. Never write v4-only syntax such as `ring-3`, `data-open:`, `rounded-4xl`, `in-data-[…]`, `supports-backdrop-filter:`, `size-4!` or `@import "tw-animate-css"`.
5. **Legacy styling is removed.** F1 deletes the old tokens and classes: `primary`, `on-surface*`, `surface-container*`, `outline-variant`, `tertiary`, `secondary*`, `error*`, `glass-card`, `chip*`, `btn-*`, `cf-*`, `ai-focus`, `font-display`, `text-label-caps`, `text-headline-md`, `text-display-lg`, `text-body-base`, `text-code-sm`, and the custom spacing keys `xs/sm/md/lg/xl/gutter/margin`. Every package rewrites its own files with the new tokens (section 7).
6. **Imports between packages** are limited to the modules in section 5. Server-only modules (anything that imports `@/lib/db/client`) must never be imported from a `'use client'` file. Client components import plan data from `@/lib/billing/catalog`, never from `@/lib/plans`.
7. **API error shape everywhere:** `{ error: string, code?: string, ...extra }`. Status codes: 400 for validation (`code: 'invalid_request'`, plus `issues` from `zod.flatten()`), 401 `unauthorized`, 402 for plan errors (section 5.2), 403 `forbidden`, 404 `not_found`, 409 `conflict` or a more specific code, 429 `rate_limited`, 500 `internal_error`, 502 `upstream_error`, 503 `not_configured`.
8. **Tests:** every package adds or updates Vitest tests for its own libs and routes under the test paths it owns. Mock `@/lib/db/client` and `@/auth` the way the existing tests do. `pnpm vitest run` must stay green.
9. **No placeholder content.** No TODO stubs, no lorem ipsum, no fake testimonials, logos, user counts or revenue numbers.

---

## 1. Package ownership (binding, unchanged)

- **F1 Design system + app shell [runs first]:** `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/fonts/**`, `components/ui/**` (restyle the existing primitives and add new ones on top of the installed `@base-ui/react`: input, select, switch, tabs, tooltip, dropdown-menu, avatar, toast, empty-state, page-header, stat, kbd, and so on), `components/brand/**` (new logo and wordmark), `components/app-sidebar.tsx`, `components/app-shell.tsx` (new), `components/loading-spinner.tsx`, `app/error.tsx`, `app/not-found.tsx`
- **F2 Platform: schema, plans, billing lib, tokens, deps [runs first]:** `package.json`, `pnpm-lock.yaml` (install every dependency listed in this spec for all packages), `lib/db/schema.ts` (all new tables and columns in this spec), `lib/db/client.ts`, `drizzle.config.ts`, `drizzle/**` (generate the migration with `drizzle-kit generate`, no database needed), `lib/env.ts` (new optional vars must not break builds when unset), `lib/plans.ts` (plan definitions, feature keys, limits, `getUserPlan`, `assertFeature` and `assertWithinLimit` helpers), `lib/billing/**` (Razorpay REST client via fetch, subscription create and cancel, webhook HMAC verification, plan sync), `lib/auth/api-token.ts` (hashed personal access tokens for the Chrome extension), `lib/db/queries/billing.ts`, `lib/db/queries/tokens.ts`, `middleware.ts`, `auth.ts`, `vercel.json` (cron entries), `.env.example`, `tests/lib/**` for these libs
- **P1 Marketing site + pricing:** `app/page.tsx`, `components/landing-content.tsx` (replace), `components/landing/**` (new), `app/pricing/**` (new), and legal pages if useful (`app/terms/**`, `app/privacy/**`)
- **P2 Onboarding, login, settings, voice:** `app/login/**`, `app/onboarding/**`, `components/onboarding-stepper.tsx`, `components/onboarding/**`, `app/settings/**`, `components/settings-account.tsx`, `components/settings/**`, `components/voice-profile-manager.tsx`, `app/api/user/**`, `app/api/voice/**`, `app/api/onboarding/**` (new), `lib/db/queries/voice.ts`, `lib/db/queries/onboarding.ts` (new), and tests for these (`tests/api/voice*.test.ts` and new ones)
- **P3 Autopilot engine + publishing backend:** `lib/pipeline/**`, `lib/autopilot/**` (new: schedules, ship-moment detection, weekly digest, queue), `lib/publish/**` (new: LinkedIn OAuth and posts API publisher, X intent-URL builder, publish log), `lib/ai/**` (improve prompts and quality if useful), `lib/github/**`, `lib/email/**`, `lib/mailer.ts`, `lib/rate-limit.ts`, `lib/validators/**`, `types/**`, `app/api/cron/**` (secured with `CRON_SECRET`), `app/api/autopilot/**`, `app/api/integrations/**` (LinkedIn connect, callback, disconnect), `app/api/drafts/**` (including the new schedule, approve and publish routes), `app/api/jobs/**`, `app/api/generate/**`, `app/api/repos/**`, `app/api/github/**`, `app/api/notifications/**`, `app/api/webhooks/github/**`, `lib/db/queries/{drafts,events,jobs,logs,narratives,notifications,repos,snapshots,summaries}.ts` and the new `lib/db/queries/{autopilot,publish,integrations}.ts`, and `tests/{ai,api,github,pipeline,db,types,auth}/**` for these (keep existing tests passing or update them to the new behaviour)
- **P4 App UI (dashboard, queue, calendar, drafts, jobs, repos, analytics):** `app/dashboard/**`, `app/drafts/**`, `app/jobs/**`, `app/repositories/**`, `app/analytics/**`, `app/calendar/**` (new), `app/queue/**` (new), `components/dashboard-bento.tsx`, `components/post-card.tsx`, `components/generate-form.tsx`, `components/repo-connect.tsx`, `components/repo-manager.tsx`, `components/app/**` (new), `lib/hooks/**`, `tests/components/**`
- **P5 Billing API + UI:** `app/api/billing/**`, `app/api/webhooks/razorpay/**`, `app/billing/**`, `components/billing/**` (`UpgradeDialog`, `PlanBadge`, `UsageMeter`, `PaywallGate`, with the exact export names and props in this spec), `tests/api/billing*.test.ts`
- **P6 Chrome extension + extension API:** `extension/**` (MV3: `manifest.json`, background service worker, content scripts for linkedin.com, x.com/twitter.com and github.com, popup UI styled with the design tokens, options page, plus `extension/README.md` with load-unpacked steps and a zip script), `app/api/extension/**` (token-authenticated endpoints: whoami, list queued drafts, mark draft posted, draft-from-github-url), `app/extension/**` (page where the signed-in user creates and revokes an extension token and gets install steps), `tests/api/extension*.test.ts`

**Files not listed above:**
- F2 owns `tsconfig.json` (add `"extension"` to `exclude`), `next.config.mjs`, `vitest.config.ts` (add `exclude: ['extension/**', 'node_modules/**']`), `postcss.config.mjs`, `components.json`, `scripts/**` and `.github/**`.
- `components/dashboard-bento.tsx` belongs to P4. P4 may delete it if it is no longer used.
- `README.md`, `ARCHITECTURE.md` and `docs/**` are for the orchestrator only.
- `lib/utils.ts` is shared and read-only: `cn(...inputs)`. Nobody edits it.

---

## 2. Dependencies (F2 installs all of them up front with pnpm)

Runtime:
| Package | Version | Used by | Why |
|---|---|---|---|
| `@vercel/functions` | latest `^2` or `^3` | P3 | `waitUntil()` for durable fire-and-forget pipeline runs |
| `next-themes` | `^0.4` | F1 | Light, dark and system theme with the `class` strategy |
| `date-fns` | `^4` | P3, P4 | Calendar math and formatting |
| `@date-fns/tz` | `^1` | P3, P4 | `TZDate` for slot computation in the user's timezone |

Dev:
| Package | Version | Used by | Why |
|---|---|---|---|
| `@types/chrome` | latest | P6 | Extension types (extension tsconfig only) |
| `fflate` | `^0.8` | P6 | `zipSync` in `extension/build.mjs --zip` |

`esbuild` is already a devDependency and P6 uses it to bundle the extension. Do **not** add the Razorpay SDK, because billing uses REST through `fetch`. Do not add a charts library, because charts are hand-built SVG. Do not add `sonner`, because toasts use base-ui Toast.

`package.json` scripts F2 adds: `"ext:build": "node extension/build.mjs"`, `"ext:zip": "node extension/build.mjs --zip"`, `"typecheck": "tsc --noEmit"`.

---

## 3. Environment variables

`lib/env.ts` (F2) must never throw at import time. Missing required values throw only when the helper that needs them is called.

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres (Neon) connection string |
| `NEXTAUTH_URL` | yes | Public app URL, used by Auth.js |
| `NEXTAUTH_SECRET` | yes | JWT signing secret |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | yes | GitHub OAuth app |
| `GEMINI_API_KEY` | yes | Primary AI provider |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | yes in production | 64 hex chars. AES-256-GCM for LinkedIn tokens (`lib/auth/encrypt.ts`) |
| `APP_URL` | optional | Canonical public origin for emails, approval links and OAuth redirects. Falls back to `NEXTAUTH_URL`, then `https://$VERCEL_URL`, then `http://localhost:3000` |
| `CRON_SECRET` | yes in production | Bearer secret for `/api/cron/*`. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` |
| `RESEND_API_KEY` | optional | Real email. When unset, mail is logged to the console |
| `EMAIL_FROM` | optional | Default `CommitFlex <onboarding@resend.dev>` |
| `WEBHOOK_BASE_URL` | optional | Public origin for GitHub webhooks (tunnel in dev) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | optional | LinkedIn app with "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" products. When unset, the Connect LinkedIn UI shows "Not available" and publishing falls back to the handoff |
| `LINKEDIN_API_VERSION` | optional | `LinkedIn-Version` header for the Posts API. Default `202510` |
| `ANTHROPIC_API_KEY` | optional | Fallback AI provider when Gemini's circuit is open (P3 may use it) |
| `AI_PROVIDER` | optional | `gemini` (default) or `anthropic` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | optional | Razorpay API keys. When unset, checkout returns 503 `not_configured` |
| `RAZORPAY_WEBHOOK_SECRET` | optional | Webhook HMAC secret |
| `RAZORPAY_PLAN_PRO_MONTHLY_INR`, `RAZORPAY_PLAN_PRO_YEARLY_INR`, `RAZORPAY_PLAN_PRO_MONTHLY_USD`, `RAZORPAY_PLAN_PRO_YEARLY_USD`, `RAZORPAY_PLAN_TEAM_MONTHLY_INR`, `RAZORPAY_PLAN_TEAM_YEARLY_INR`, `RAZORPAY_PLAN_TEAM_MONTHLY_USD`, `RAZORPAY_PLAN_TEAM_YEARLY_USD` | optional | Razorpay plan IDs (`plan_…`) created in the dashboard with the amounts in section 5.2. A missing combination returns 503 `currency_unavailable` |
| `NEXT_PUBLIC_CHROME_EXTENSION_URL` | optional | Chrome Web Store listing. When unset, `/extension` shows load-unpacked steps |

`.env.example` (F2) lists all of these with empty or placeholder values and one comment line each.

---

## 4. Database schema (F2 implements all of it in `lib/db/schema.ts`, then runs `pnpm db:generate`)

Keep every existing table and column. Add the `uniqueIndex` import. New tables use snake_case column names. TypeScript keys are camelCase. All `timestamp` columns use `{ mode: 'date' }`.

### 4.1 Columns added to existing tables

```ts
// repos
autopilotEnabled: boolean('autopilot_enabled').notNull().default(true),
webhookEvents: text('webhook_events').array().notNull().default(['push']),

// generation_jobs
trigger: varchar('trigger', { length: 30 }).notNull().default('manual'),
  // 'manual'|'push'|'pr_merged'|'release_published'|'weekly_digest'|'cadence'|'extension'|'onboarding'
voiceProfileId: uuid('voice_profile_id').references(() => voiceSettings.id, { onDelete: 'set null' }),
autoQueue: boolean('auto_queue').notNull().default(false),

// user_notification_preferences
approvalRequests: boolean('approval_requests').notNull().default(true),
readyToPost: boolean('ready_to_post').notNull().default(true),
publishReceipts: boolean('publish_receipts').notNull().default(true),
```

### 4.2 New tables

```ts
export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 30 }),                 // founder|engineer|maintainer|freelancer|student|devrel
  pitch: varchar('pitch', { length: 160 }),
  audiences: text('audiences').array().notNull().default([]),            // developers|recruiters|customers|founders|users
  platforms: text('platforms').array().notNull().default(['linkedin', 'twitter']),
  tonePreset: varchar('tone_preset', { length: 30 }),    // plain_technical|story_led|confident_founder|teacher|casual
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  country: varchar('country', { length: 2 }),
  onboardingStep: varchar('onboarding_step', { length: 30 }).notNull().default('repos'),
    // repos|role|audience|platforms|voice|cadence|done
  onboardedAt: timestamp('onboarded_at', { mode: 'date' }),
  trialEndsAt: timestamp('trial_ends_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const autopilotSettings = pgTable('autopilot_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  cadence: varchar('cadence', { length: 20 }).notNull().default('ship_moments'),
    // ship_moments|weekly|twice_weekly|three_weekly|weekdays
  postDays: integer('post_days').array().notNull().default([2, 4]),     // 0=Sun … 6=Sat
  postTime: varchar('post_time', { length: 5 }).notNull().default('09:00'), // HH:MM, profile timezone
  triggers: text('triggers').array().notNull().default(['pr_merged', 'release_published', 'weekly_digest']),
    // pr_merged|release_published|weekly_digest|push_window
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
  platform: varchar('platform', { length: 20 }).notNull(),             // linkedin|twitter
  status: varchar('status', { length: 20 }).notNull().default('pending_review'),
    // pending_review|approved|scheduled|ready|publishing|published|failed|skipped
  scheduledFor: timestamp('scheduled_for', { mode: 'date' }),
  approvedAt: timestamp('approved_at', { mode: 'date' }),
  approvedBy: varchar('approved_by', { length: 255 }),                 // email or 'owner' or 'auto'
  publishedAt: timestamp('published_at', { mode: 'date' }),
  publishMethod: varchar('publish_method', { length: 20 }),           // linkedin_api|x_intent|extension|manual
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
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),          // sha256 hex
  email: varchar('email', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ hashUidx: uniqueIndex('approval_tokens_hash_uidx').on(t.tokenHash) }))

export const shipEvents = pgTable('ship_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 30 }).notNull(),                     // pr_merged|release_published|push
  externalId: varchar('external_id', { length: 100 }).notNull(),       // PR number | release id | YYYY-MM-DD for push
  title: text('title').notNull(),
  url: text('url'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),        // e.g. { additions, deletions, skipped: 'limit_reached' }
  jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  dedupeUidx: uniqueIndex('ship_events_dedupe_uidx').on(t.repoId, t.kind, t.externalId),
  userCreatedIdx: index('ship_events_user_created_idx').on(t.userId, t.createdAt),
}))

export const socialConnections = pgTable('social_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(),             // linkedin
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(), // LinkedIn OIDC `sub`
  displayName: varchar('display_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  avatarUrl: text('avatar_url'),
  accessTokenEnc: text('access_token_enc').notNull(),                  // encrypt() from lib/auth/encrypt.ts
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
  success: boolean('success').notNull(),
  statusCode: integer('status_code'),
  externalPostId: text('external_post_id'),
  error: text('error'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ userCreatedIdx: index('publish_log_user_created_idx').on(t.userId, t.createdAt) }))

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull().default('razorpay'),
  plan: varchar('plan', { length: 20 }).notNull(),                     // pro|team
  interval: varchar('interval', { length: 10 }).notNull(),             // month|year
  currency: varchar('currency', { length: 3 }).notNull(),              // INR|USD
  status: varchar('status', { length: 20 }).notNull().default('created'),
    // created|authenticated|active|pending|halted|cancelled|completed|paused|expired
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
  eventId: varchar('event_id', { length: 100 }).notNull(),             // x-razorpay-event-id
  type: varchar('type', { length: 60 }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp('processed_at', { mode: 'date' }),
  error: text('error'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ eventUidx: uniqueIndex('billing_events_event_uidx').on(t.provider, t.eventId) }))

export const usageCounters = pgTable('usage_counters', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 7 }).notNull(),                  // 'YYYY-MM' (UTC)
  metric: varchar('metric', { length: 40 }).notNull(),                 // 'generations'
  count: integer('count').notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.period, t.metric] }) }))

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),      // 'cfx_' + first 8 chars, for display
  scopes: text('scopes').array().notNull().default(['extension']),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  revokedAt: timestamp('revoked_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  hashUidx: uniqueIndex('api_tokens_hash_uidx').on(t.tokenHash),
  userIdx: index('api_tokens_user_idx').on(t.userId),
}))
```

F2 also exports the inferred row types from `lib/db/schema.ts`: `export type UserProfileRow = typeof userProfiles.$inferSelect`, and the same for `AutopilotSettingsRow`, `QueueItemRow`, `ShipEventRow`, `SocialConnectionRow`, `PublishLogRow`, `SubscriptionRow`, `BillingEventRow`, `ApiTokenRow`, `PostDraftRow`, `RepoRow` and `GenerationJobRow`.

Migration: run `pnpm db:generate` and commit the generated `drizzle/0006_*.sql` together with its snapshot and journal update. Do not edit earlier migrations.

---

## 5. Cross-package modules and signatures

### 5.1 F2: environment (`lib/env.ts`)
```ts
export function appUrl(): string                       // no trailing slash
export function optionalEnv(name: string): string | undefined   // '' is treated as undefined
export function requireEnv(name: string): string       // throws Error(`Missing env ${name}`) when called
export type Integration = 'linkedin' | 'razorpay' | 'email' | 'cron' | 'anthropic'
export function isConfigured(integration: Integration): boolean
  // linkedin: LINKEDIN_CLIENT_ID && LINKEDIN_CLIENT_SECRET && OAUTH_TOKEN_ENCRYPTION_KEY
  // razorpay: RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
  // email: RESEND_API_KEY   cron: CRON_SECRET   anthropic: ANTHROPIC_API_KEY
```

### 5.2 F2: plan catalog, client-safe (`lib/billing/catalog.ts`, no server imports)
```ts
export type PlanId = 'free' | 'pro' | 'team'
export type PaidPlanId = 'pro' | 'team'
export type BillingInterval = 'month' | 'year'
export type Currency = 'INR' | 'USD'
export type FeatureKey =
  | 'autopilot.weekly_digest' | 'autopilot.ship_moments' | 'autopilot.cadence'
  | 'publish.linkedin_direct' | 'publish.auto_approve' | 'drafts.variants'
  | 'analytics.advanced' | 'voice.fingerprint' | 'team.reviewers'
  | 'extension.github_button' | 'support.priority'
export type LimitKey = 'repos' | 'generationsPerMonth' | 'voiceProfiles' | 'queuedPosts' | 'extensionTokens' | 'reviewers'
export type PlanStatus = 'free' | 'trialing' | 'active' | 'past_due' | 'cancelling'

export interface PlanDefinition {
  id: PlanId
  name: string                 // 'Free' | 'Pro' | 'Team'
  tagline: string              // Free: 'Try it on one repo.'  Pro: 'Build in public on autopilot.'  Team: 'Review before anything goes out.'
  prices: Record<Currency, Record<BillingInterval, number>>   // major units: 499, 4990, 9, 90 …
  features: FeatureKey[]
  limits: Record<LimitKey, number>
  highlights: string[]         // 4–6 plain-language bullets for pricing cards (no numbers that aren't in limits)
}
export const PLANS: Record<PlanId, PlanDefinition>   // exact values in PRODUCT_SPEC §7
export const PLAN_ORDER: readonly PlanId[]           // ['free','pro','team']
export const FEATURE_LABELS: Record<FeatureKey, string>   // e.g. 'autopilot.ship_moments': 'Drafts from merged PRs and releases'
export const LIMIT_LABELS: Record<LimitKey, { label: string; unit: string }>  // { label: 'Drafts this month', unit: 'drafts' }
export const TRIAL_DAYS = 14
export function planHasFeature(plan: PlanId, key: FeatureKey): boolean
export function limitFor(plan: PlanId, key: LimitKey): number
export function requiredPlanFor(key: FeatureKey): PaidPlanId | 'free'    // cheapest plan that has it
export function formatPrice(amount: number, currency: Currency): string  // '₹4,990' | '$90' (Intl, no decimals)
export function yearlySavings(plan: PaidPlanId, currency: Currency): number  // 12*month - year

// Shape of every 402 body (server and client agree on this)
export type PlanErrorBody =
  | { error: string; code: 'feature_locked'; feature: FeatureKey; requiredPlan: PaidPlanId; currentPlan: PlanId }
  | { error: string; code: 'limit_reached'; limit: LimitKey; used: number; max: number; requiredPlan: PaidPlanId; currentPlan: PlanId }
export function isPlanErrorBody(body: unknown): body is PlanErrorBody
```

### 5.3 F2: entitlements, server-only (`lib/plans.ts`)
`lib/plans.ts` re-exports everything from `@/lib/billing/catalog` and adds:
```ts
export interface Plan {
  id: PlanId                          // effective plan: trial → 'pro'
  definition: PlanDefinition
  status: PlanStatus
  interval: BillingInterval | null
  currency: Currency | null
  currentPeriodEnd: Date | null
  trialEndsAt: Date | null
  subscriptionId: string | null       // subscriptions.id of the entitled row
}
export async function getUserPlan(userId: string): Promise<Plan>
  // entitled subscription: status in (authenticated, active, pending) OR (cancelled AND current_period_end > now).
  // pending → status 'past_due'; cancelled-but-running → 'cancelling'. Best plan wins (team > pro).
  // else trial_ends_at > now → { id: 'pro', status: 'trialing' } else free.
export async function hasFeature(userId: string, key: FeatureKey): Promise<boolean>
export class PlanError extends Error { readonly status: 402; readonly body: PlanErrorBody }
export async function assertFeature(userId: string, key: FeatureKey): Promise<Plan>   // throws PlanError
export async function assertWithinLimit(userId: string, key: LimitKey, opts?: { adding?: number }): Promise<{ plan: Plan; used: number; max: number }>
  // throws PlanError when used + (adding ?? 1) > max
export async function recordUsage(userId: string, metric: 'generations', amount?: number): Promise<number>  // atomic upsert, returns new count
export interface UsageSnapshot { period: string; items: Record<LimitKey, { used: number; max: number }> }
export async function getUsage(userId: string): Promise<UsageSnapshot>
export function planErrorToResponse(err: unknown): Response | null   // PlanError → Response.json(body, { status: 402 })
export function currentPeriod(date?: Date): string                    // 'YYYY-MM' UTC
```
Counting rules are in PRODUCT_SPEC §7. They are implemented in `lib/db/queries/billing.ts` as `countUsage(userId, key: LimitKey, period: string): Promise<number>`.

### 5.4 F2: billing library (`lib/billing/*`, server)
```ts
// lib/billing/razorpay.ts
export class RazorpayError extends Error { status: number; code?: string; description?: string }
export async function razorpayRequest<T>(method: 'GET'|'POST'|'PATCH'|'DELETE', path: string, body?: unknown): Promise<T>
  // https://api.razorpay.com/v1 + path, Basic auth KEY_ID:KEY_SECRET, throws RazorpayError
export interface RazorpaySubscription { id: string; plan_id: string; customer_id: string | null; status: string;
  current_start: number | null; current_end: number | null; ended_at: number | null; charge_at: number | null;
  short_url?: string; notes: Record<string, string> }
export async function createSubscription(input: { razorpayPlanId: string; totalCount: number; notes: Record<string, string>; customerNotify?: boolean }): Promise<RazorpaySubscription>
  // totalCount: 120 for month, 10 for year
export async function fetchSubscription(id: string): Promise<RazorpaySubscription>
export async function cancelSubscription(id: string, opts: { atCycleEnd: boolean }): Promise<RazorpaySubscription>
export interface RazorpayInvoice { id: string; amount: number; currency: string; status: string; date: number | null; short_url: string | null }
export async function listSubscriptionInvoices(subscriptionId: string): Promise<RazorpayInvoice[]>
export function getRazorpayKeyId(): string

// lib/billing/plan-map.ts
export function getRazorpayPlanId(plan: PaidPlanId, interval: BillingInterval, currency: Currency): string | null
export function resolveRazorpayPlanId(razorpayPlanId: string): { plan: PaidPlanId; interval: BillingInterval; currency: Currency } | null

// lib/billing/verify.ts
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret?: string): boolean // HMAC-SHA256 hex, timingSafeEqual
export function verifyCheckoutSignature(input: { paymentId: string; subscriptionId: string; signature: string }): boolean
  // HMAC_SHA256(`${paymentId}|${subscriptionId}`, RAZORPAY_KEY_SECRET)

// lib/billing/sync.ts
export function mapRazorpayStatus(status: string): SubscriptionRow['status']
export async function upsertSubscriptionFromRazorpay(sub: RazorpaySubscription, ctx: { userId: string; paymentId?: string }): Promise<SubscriptionRow>
  // When the row becomes entitled, cancel (immediately, at Razorpay and locally) every OTHER entitled subscription of the user.
export interface RazorpayWebhookEvent { event: string; payload: { subscription?: { entity: RazorpaySubscription }; payment?: { entity: { id: string; status: string; error_description?: string | null } } }; created_at: number }
export async function applyWebhookEvent(eventId: string, event: RazorpayWebhookEvent): Promise<{ handled: boolean; duplicate: boolean; userId: string | null; kind: 'activated' | 'charged' | 'payment_failed' | 'cancelled' | 'halted' | 'other' }>
  // Inserts billing_events (unique provider+event_id → duplicate=true, no-op). userId comes from subscription notes.userId.
  // After a downgrade (plan becomes free/lower), calls enforcePlanLimits(userId).
export async function enforcePlanLimits(userId: string): Promise<void>
  // repos beyond limit → autopilot_enabled=false (newest first). Never deletes data.

// lib/billing/currency.ts
export function detectCurrency(headers: Headers): Currency   // x-vercel-ip-country === 'IN' → 'INR' else 'USD'
```

### 5.5 F2: billing queries (`lib/db/queries/billing.ts`)
```ts
export async function getEntitledSubscription(userId: string): Promise<SubscriptionRow | null>
export async function listSubscriptions(userId: string): Promise<SubscriptionRow[]>
export async function getSubscriptionByRazorpayId(id: string): Promise<SubscriptionRow | null>
export async function insertPendingSubscription(input: { userId: string; plan: PaidPlanId; interval: BillingInterval; currency: Currency; razorpaySubscriptionId: string; razorpayPlanId: string }): Promise<SubscriptionRow>
export async function updateSubscription(id: string, patch: Partial<SubscriptionRow>): Promise<SubscriptionRow>
export async function countUsage(userId: string, key: LimitKey, period: string): Promise<number>
export async function incrementUsageCounter(userId: string, metric: string, period: string, amount: number): Promise<number>
export async function getTrialEndsAt(userId: string): Promise<Date | null>      // reads user_profiles.trial_ends_at
```

### 5.6 F2: API tokens (`lib/auth/api-token.ts` and `lib/db/queries/tokens.ts`)
```ts
// lib/auth/api-token.ts
export const API_TOKEN_PREFIX = 'cfx_'
export function generateApiToken(): { token: string; hash: string; prefix: string }
  // token = 'cfx_' + base64url(32 random bytes); prefix = token.slice(0, 12); hash = sha256 hex
export function hashApiToken(token: string): string
export interface ApiTokenContext { userId: string; tokenId: string; scopes: string[] }
export async function authenticateApiToken(req: Request, requiredScope?: string): Promise<ApiTokenContext | null>
  // Authorization: Bearer cfx_…; not revoked; not expired; touches last_used_at at most once a minute
export function apiTokenUnauthorized(): Response   // 401 { error: 'Invalid or missing extension token', code: 'unauthorized' }

// lib/db/queries/tokens.ts
export interface ApiTokenSummary { id: string; name: string; tokenPrefix: string; scopes: string[]; lastUsedAt: string | null; createdAt: string; expiresAt: string | null }
export async function createApiToken(userId: string, name: string, scopes?: string[]): Promise<{ token: string; summary: ApiTokenSummary }>
export async function listApiTokens(userId: string): Promise<ApiTokenSummary[]>          // non-revoked only, newest first
export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean>
export async function findActiveTokenByHash(hash: string): Promise<ApiTokenRow | null>
export async function touchApiToken(tokenId: string): Promise<void>
```

### 5.7 F2: auth and middleware
- `auth.ts`: keep the GitHub provider, scopes, JWT strategy and Drizzle adapter. Add `pages: { signIn: '/login' }`. Keep the `session.user.id` callback.
- `middleware.ts` treats these as **public pages**: `/`, `/pricing`, `/terms`, `/privacy`, `/login`, `/queue/approved`. API paths are never redirected. Each route authenticates itself, and `/api/webhooks/*`, `/api/cron/*`, `/api/extension/*` and `/api/drafts/approve` use non-session auth. Signed-in users visiting `/login` go to `/dashboard`. Signed-out users on any other page go to `/login?next=<pathname>`. The middleware does **not** query the database, because the onboarding gate lives in pages.
- `vercel.json`:
  ```json
  { "crons": [ { "path": "/api/cron/autopilot", "schedule": "0 3 * * *" }, { "path": "/api/cron/publish", "schedule": "30 3 * * *" } ] }
  ```

### 5.8 P2: onboarding and profile (`lib/db/queries/onboarding.ts`, `components/onboarding/questions.ts`)
```ts
// components/onboarding/questions.ts (client-safe constants, the exact copy from PRODUCT_SPEC §4)
export type Role = 'founder' | 'engineer' | 'maintainer' | 'freelancer' | 'student' | 'devrel'
export type Audience = 'developers' | 'recruiters' | 'customers' | 'founders' | 'users'
export type TonePreset = 'plain_technical' | 'story_led' | 'confident_founder' | 'teacher' | 'casual'
export const ROLE_OPTIONS: { value: Role; label: string; description: string }[]
export const AUDIENCE_OPTIONS: { value: Audience; label: string }[]
export const TONE_OPTIONS: { value: TonePreset; label: string; description: string; example: string }[]
export const CADENCE_OPTIONS: { value: AutopilotCadence; label: string; description?: string }[]
export const POST_TIME_OPTIONS: { value: '09:00' | '12:30' | '18:00'; label: string }[]
export const TONE_TO_VOICE: Record<TonePreset, { tone: string; technicalLevel: number }>
  // plain_technical→analytical/8, story_led→storytelling/6, confident_founder→enthusiastic/5, teacher→educational/6, casual→casual/5

// lib/db/queries/onboarding.ts (server)
export type UserProfile = UserProfileRow
export async function getUserProfile(userId: string): Promise<UserProfile | null>
export async function upsertUserProfile(userId: string, patch: Partial<Omit<UserProfileRow, 'userId' | 'createdAt'>>): Promise<UserProfile>
export async function startTrialIfEligible(userId: string): Promise<Date | null>   // sets trial_ends_at once; null if not eligible
export function buildAuthorContext(profile: UserProfile | null): string
  // e.g. "Author: indie founder building 'An open-source feature flag service'. Audience: developers, customers."
```
P3 imports `getUserProfile` and `buildAuthorContext` to give the AI more context, and uses the profile `timezone` for slots. P4 pages use `getUserProfile` for the onboarding gate (`if (!profile?.onboardedAt) redirect('/onboarding')`).

### 5.9 P3: shared types (`types/autopilot.ts`, plus `types/posts.ts` stays)
```ts
import type { PostPlatform } from './posts'
export type JobTrigger = 'manual' | 'push' | 'pr_merged' | 'release_published' | 'weekly_digest' | 'cadence' | 'extension' | 'onboarding'
export type QueueStatus = 'pending_review' | 'approved' | 'scheduled' | 'ready' | 'publishing' | 'published' | 'failed' | 'skipped'
export type PublishMethod = 'linkedin_api' | 'x_intent' | 'extension' | 'manual'
export type AutopilotCadence = 'ship_moments' | 'weekly' | 'twice_weekly' | 'three_weekly' | 'weekdays'
export type AutopilotTrigger = 'pr_merged' | 'release_published' | 'weekly_digest' | 'push_window'
export type ApprovalMode = 'review' | 'auto'

export interface AutopilotSettings {
  enabled: boolean; cadence: AutopilotCadence; postDays: number[]; postTime: string
  triggers: AutopilotTrigger[]; platforms: PostPlatform[]; approvalMode: ApprovalMode
  reviewerEmails: string[]; defaultVoiceProfileId: string | null; pausedUntil: string | null
  timezone: string            // read from user_profiles, read-only here
}
export interface QueueItemView {                  // all dates ISO strings (serializable to client)
  id: string; draftId: string; jobId: string; repoId: string | null; repoFullName: string
  platform: PostPlatform; status: QueueStatus; content: string; hashtags: string[]
  scheduledFor: string | null; approvedAt: string | null; publishedAt: string | null
  publishMethod: PublishMethod | null; externalUrl: string | null; lastError: string | null
  trigger: JobTrigger; sourceTitle: string | null  // PR title / release tag / 'Weekly digest'
  createdAt: string; updatedAt: string
}
export interface QueueStats { pendingReview: number; scheduled: number; ready: number; failed: number; publishedThisMonth: number; nextScheduledAt: string | null }
export interface ShipEventView { id: string; repoFullName: string; kind: 'pr_merged' | 'release_published' | 'push'; title: string; url: string | null; jobId: string | null; skippedReason: string | null; createdAt: string }
export interface LinkedInConnectionSummary { status: 'active' | 'expired' | 'revoked'; displayName: string | null; avatarUrl: string | null; expiresAt: string | null; connectedAt: string }
export interface DraftWithRepo { id: string; jobId: string; platform: PostPlatform; status: string; content: string; hashtags: string[]; repoFullName: string; queueStatus: QueueStatus | null; createdAt: string }
export interface PublishResult { method: PublishMethod; url: string | null; intentUrl: string | null }
```
`types/posts.ts`: `PostStatus` gains `'published'`.

### 5.10 P3: server modules other packages call
```ts
// lib/pipeline/start.ts
export interface StartJobInput {
  userId: string; repoId: string
  source: { type: 'window'; windowStart: Date; windowEnd: Date } | { type: 'pr'; ref: string } | { type: 'release'; ref: string }
  trigger: JobTrigger
  voiceProfileId?: string | null
  autoQueue?: boolean          // default: true for pr_merged|release_published|weekly_digest|cadence|onboarding|push, false otherwise
}
export type StartJobResult =
  | { ok: true; jobId: string }
  | { ok: false; status: 402 | 404 | 409 | 412 | 503; code: 'limit_reached' | 'not_found' | 'active_job' | 'no_github_token' | 'circuit_open'; error: string; jobId?: string; planError?: PlanErrorBody }
export async function startGenerationJob(input: StartJobInput): Promise<StartJobResult>
  // Checks the generationsPerMonth limit, active job, GitHub token. Creates the job, records usage, runs the pipeline under waitUntil(). Never throws for expected cases.

// lib/github/url.ts (pure)
export type ParsedGithubUrl = { kind: 'pr'; owner: string; repo: string; number: number; url: string }
  | { kind: 'release'; owner: string; repo: string; tag: string; url: string }
  | { kind: 'repo'; owner: string; repo: string; url: string }
export function parseGithubUrl(input: string): ParsedGithubUrl | null

// lib/db/queries/repos.ts (added)
export async function getUserRepoByFullName(userId: string, fullName: string): Promise<RepoRow | null>   // case-insensitive

// lib/db/queries/drafts.ts (added)
export async function listRecentDrafts(userId: string, opts?: { platform?: PostPlatform; limit?: number; unqueuedOnly?: boolean }): Promise<DraftWithRepo[]>

// lib/db/queries/autopilot.ts
export async function getAutopilotSettings(userId: string): Promise<AutopilotSettings>     // defaults when no row
export async function upsertAutopilotSettings(userId: string, patch: Partial<Omit<AutopilotSettings, 'timezone'>>): Promise<AutopilotSettings>
export async function listQueue(userId: string, opts?: { statuses?: QueueStatus[]; platform?: PostPlatform; from?: Date; to?: Date; limit?: number }): Promise<QueueItemView[]>
  // ordered by scheduled_for asc nulls last, then created_at desc
export async function getQueueStats(userId: string): Promise<QueueStats>
export async function getQueueItemByDraft(userId: string, draftId: string): Promise<QueueItemView | null>
export async function listShipEvents(userId: string, limit?: number): Promise<ShipEventView[]>

// lib/db/queries/integrations.ts
export async function getLinkedInConnectionSummary(userId: string): Promise<LinkedInConnectionSummary | null>

// lib/db/queries/publish.ts
export async function getPublishStats(userId: string, opts: { from: Date; to: Date }): Promise<{
  byDay: { date: string; linkedin: number; twitter: number }[]      // date 'YYYY-MM-DD' in user tz
  byTrigger: { trigger: JobTrigger; count: number }[]
  byMethod: { method: PublishMethod; count: number }[]
  totals: { published: number; failed: number; drafted: number; approved: number }
}>

// lib/autopilot/queue.ts (actions; all verify ownership, throw QueueError(status, code, message))
export class QueueError extends Error { status: number; code: string }
export async function approveDraft(userId: string, draftId: string, approvedBy?: string): Promise<QueueItemView>
export async function scheduleDraft(userId: string, draftId: string, at: Date | 'next_slot'): Promise<QueueItemView>
export async function unscheduleDraft(userId: string, draftId: string): Promise<QueueItemView>
export async function skipDraft(userId: string, draftId: string): Promise<QueueItemView>
export async function publishDraftNow(userId: string, draftId: string): Promise<{ item: QueueItemView; result: PublishResult }>
export async function recordManualPublish(input: { userId: string; draftId: string; method: 'extension' | 'x_intent' | 'manual'; externalUrl?: string | null }): Promise<QueueItemView>
export function queueErrorToResponse(err: unknown): Response | null

// lib/publish/intents.ts (pure, client-safe)
export function buildXIntentUrl(text: string, opts?: { hashtags?: string[] }): string     // https://x.com/intent/post?text=…
export function buildLinkedInComposeUrl(text: string): string  // https://www.linkedin.com/feed/?shareActive=true&text=…
export function composePostText(content: string, hashtags: string[], platform: PostPlatform): string
  // appends hashtags not already present; X result ≤ 280 chars (drops hashtags first)

// lib/email/templates/billing-notice.tsx (for P5)
export function BillingNoticeEmail(props: { firstName: string; kind: 'activated' | 'payment_failed' | 'cancelled' | 'trial_ending' | 'trial_ended'; planName: string; manageUrl: string; periodEnd?: string | null }): JSX.Element
// lib/mailer.ts stays: sendEmail({ to, subject, react, text? })
// lib/email/templates/welcome.tsx (for P2)
export function WelcomeEmail(props: { firstName: string; dashboardUrl: string; extensionUrl: string; linkedinConnected: boolean }): JSX.Element
```
LinkedIn publishing details (P3): use OAuth scopes `openid profile email w_member_social`. The CSRF state goes in an httpOnly, `sameSite=lax` cookie `cf_li_state` (10 minutes) along with `returnTo`. Profile comes from `GET https://api.linkedin.com/v2/userinfo`. Posts go to `POST https://api.linkedin.com/rest/posts` with headers `LinkedIn-Version: ${LINKEDIN_API_VERSION ?? '202510'}` and `X-Restli-Protocol-Version: 2.0.0`, and body `{ author: 'urn:li:person:{sub}', commentary, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }`. `commentary` must escape LinkedIn "little text" reserved characters `\ | { } @ [ ] ( ) < > # * _ ~` with a backslash. Hashtags are written as `{hashtag|\#|tag}`. The post URN comes from the `x-restli-id` response header, and the URL is `https://www.linkedin.com/feed/update/{urn}/`.

### 5.11 P5: billing components (`components/billing/*`, all `'use client'`)
```ts
// components/billing/upgrade-dialog.tsx
export interface UpgradeReason { code: 'feature_locked' | 'limit_reached' | 'manual'; feature?: FeatureKey; limit?: LimitKey; used?: number; max?: number }
export interface UpgradeDialogProps { open: boolean; onOpenChange: (open: boolean) => void; reason?: UpgradeReason; requiredPlan?: PaidPlanId; currentPlan?: PlanId; source?: string }
export function UpgradeDialog(props: UpgradeDialogProps): JSX.Element
  // Explains what's locked, shows the required plan card with a monthly/yearly toggle and a CheckoutButton. Links to /pricing.

// components/billing/upgrade-provider.tsx
export function UpgradeProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useUpgrade(): {
  openUpgrade: (reason?: UpgradeReason, requiredPlan?: PaidPlanId) => void
  handlePlanError: (res: Response) => Promise<boolean>   // reads a 402 body (clone), opens the dialog, returns true if handled
}
  // Outside a provider: openUpgrade navigates to /pricing and handlePlanError returns false (no crash).

// components/billing/plan-badge.tsx
export function PlanBadge(props: { plan: PlanId; status?: PlanStatus; size?: 'sm' | 'md'; className?: string }): JSX.Element
  // 'Free' neutral, 'Pro' accent, 'Team' accent-ink outline; status trialing shows 'Pro trial'

// components/billing/usage-meter.tsx
export function UsageMeter(props: { label: string; used: number; max: number; unit?: string; className?: string; showUpgrade?: boolean }): JSX.Element
  // bar turns warning ≥80 %, danger at 100 %; text "7 of 10 drafts"

// components/billing/paywall-gate.tsx
export function PaywallGate(props: { plan: PlanId; feature: FeatureKey; children: React.ReactNode; title?: string; description?: string; mode?: 'replace' | 'overlay' }): JSX.Element
  // renders children when allowed; else a locked panel (lock icon, title, description, "Upgrade to {Plan}" opening the dialog)

// components/billing/checkout-button.tsx
export function CheckoutButton(props: { plan: PaidPlanId; interval: BillingInterval; currency?: Currency; children?: React.ReactNode; className?: string; variant?: 'primary' | 'secondary'; size?: 'md' | 'lg'; fullWidth?: boolean; onSuccess?: () => void }): JSX.Element
  // loads https://checkout.razorpay.com/v1/checkout.js on demand; 401 → router.push(`/login?next=/pricing`);
  // success → POST /api/billing/verify → toast 'You're on {Plan}' → router.refresh() → onSuccess
```
`AppShell` (F1) wraps page content in `<UpgradeProvider>`. P1's pricing page and P5's billing page also wrap themselves in `<UpgradeProvider>`. Nesting providers is harmless because the innermost one wins.

### 5.12 F1: UI kit (`components/ui/*`), brand and shell

All UI components are named exports. Client components start with `'use client'`. Every interactive component forwards `className` and has visible focus (`focus-ring`).

| File | Exports and key props |
|---|---|
| `button.tsx` | `Button` (`variant: 'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'danger' \| 'link'`, default `primary`; `size: 'sm' \| 'md' \| 'lg' \| 'icon-sm' \| 'icon' \| 'icon-lg'`, default `md`; `loading?: boolean` shows a Spinner, sets `aria-busy` and disables the button), `ButtonLink` (same variants and sizes plus a next/link `href`), `buttonVariants` (cva) |
| `badge.tsx` | `Badge` (`variant: 'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger' \| 'outline' \| 'marker'`, `size?: 'sm' \| 'md'`) |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |
| `input.tsx` | `Input` (`leadingIcon?: LucideIcon`, `trailing?: ReactNode`, `invalid?: boolean`) |
| `textarea.tsx` | `Textarea` (`autoResize?: boolean`, `invalid?: boolean`) |
| `label.tsx` | `Label` |
| `field.tsx` | `Field` (`label: string`, `htmlFor?: string`, `description?: ReactNode`, `error?: string \| null`, `required?: boolean`, `children`) |
| `select.tsx` | `Select<T extends string>` (`value: T`, `onValueChange: (v: T) => void`, `options: { value: T; label: string; description?: string; disabled?: boolean }[]`, `placeholder?`, `id?`, `disabled?`, `size?: 'sm' \| 'md'`, `aria-label?`) |
| `checkbox.tsx` | `Checkbox` (`checked`, `onCheckedChange(checked: boolean)`, `id?`, `disabled?`, `aria-label?`) |
| `radio-group.tsx` | `RadioGroup` (`value`, `onValueChange`), `RadioGroupItem` (`value`, `id?`) |
| `choice-group.tsx` | `ChoiceGroup<T extends string>` (`value: T \| T[]`, `onChange: (v: T \| T[]) => void`, `options: { value: T; label: string; description?: string; icon?: LucideIcon; badge?: ReactNode; disabled?: boolean }[]`, `multiple?: boolean`, `max?: number`, `columns?: 1 \| 2 \| 3`, `aria-label: string`). Selectable option cards with arrow-key navigation, used by onboarding and settings |
| `switch.tsx` | `Switch` (`checked`, `onCheckedChange`, `id?`, `disabled?`, `aria-label?`) |
| `slider.tsx` | `Slider` (`value: number`, `onValueChange`, `min?`, `max?`, `step?`, `aria-label`) |
| `segmented-control.tsx` | `SegmentedControl<T extends string>` (`value`, `onValueChange`, `options: { value: T; label: string; icon?: LucideIcon; disabled?: boolean }[]`, `size?: 'sm' \| 'md'`, `aria-label: string`) |
| `tabs.tsx` | `Tabs` (`value`, `onValueChange`, or `defaultValue`), `TabsList`, `TabsTrigger` (`value`, `count?: number`), `TabsContent` (`value`). Underline style |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogContent` (`size?: 'sm' \| 'md' \| 'lg'`, `showClose?`), `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogFooter`, `DialogClose` |
| `alert-dialog.tsx` | `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel`, `AlertDialogAction` (`variant?: 'primary' \| 'danger'`) |
| `sheet.tsx` | `Sheet`, `SheetTrigger`, `SheetContent` (`side?: 'right' \| 'left' \| 'bottom'`, `size?: 'md' \| 'lg'`), `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetBody`, `SheetFooter`, `SheetClose` |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent` (`side?`, `align?`) |
| `dropdown-menu.tsx` | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent` (`align?`), `DropdownMenuItem` (`icon?: LucideIcon`, `variant?: 'default' \| 'danger'`, `onSelect?`), `DropdownMenuLinkItem` (`href`), `DropdownMenuLabel`, `DropdownMenuSeparator` |
| `tooltip.tsx` | `TooltipProvider`, `Tooltip` (`content: ReactNode`, `side?`, `children: ReactElement`) |
| `avatar.tsx` | `Avatar` (`src?: string \| null`, `name?: string \| null`, `size?: 'xs' \| 'sm' \| 'md' \| 'lg'`), initials fallback |
| `toast.tsx` | `Toaster` (mounted once in the root layout), `toast(title, opts?)`, `toast.success(title, opts?)`, `toast.error(title, opts?)`, `toast.info(title, opts?)`. Opts: `{ description?: string; action?: { label: string; onClick: () => void }; duration?: number }`. Built on base-ui `Toast.createToastManager()` so it can be called from any client code |
| `skeleton.tsx` | `Skeleton` |
| `spinner.tsx` | `Spinner` (`size?: 12 \| 14 \| 16 \| 20 \| 24`, `label?: string`) |
| `progress.tsx` | `Progress` (`value: number`, `max?: number`, `tone?: 'accent' \| 'success' \| 'warning' \| 'danger'`, `aria-label`) |
| `empty-state.tsx` | `EmptyState` (`icon: LucideIcon`, `title: string`, `description?: ReactNode`, `action?: ReactNode`, `secondaryAction?: ReactNode`, `size?: 'sm' \| 'md'`) |
| `error-state.tsx` | `ErrorState` (`title?: string`, `description?: ReactNode`, `onRetry?: () => void`, `retryLabel?: string`) |
| `page-header.tsx` | `PageHeader` (`title: string`, `description?: ReactNode`, `actions?: ReactNode`, `breadcrumb?: { label: string; href?: string }[]`, `meta?: ReactNode`) |
| `form-section.tsx` | `FormSection` (`title: string`, `description?: ReactNode`, `children`, `footer?: ReactNode`). Two-column settings layout |
| `stat.tsx` | `Stat` (`label: string`, `value: ReactNode`, `hint?: ReactNode`, `delta?: { value: string; tone: 'positive' \| 'negative' \| 'neutral' }`, `icon?: LucideIcon`), `StatGroup` (a row divided by hairlines, not cards) |
| `kbd.tsx` | `Kbd` |
| `separator.tsx` | `Separator` (`orientation?`) |
| `table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableEmpty` (`colSpan`, `children`) |
| `callout.tsx` | `Callout` (`tone: 'info' \| 'success' \| 'warning' \| 'danger'`, `title: string`, `children?`, `action?: ReactNode`, `icon?: LucideIcon`) |
| `copy-button.tsx` | `CopyButton` (`value: string`, `label?: string`, `copiedLabel?: string`, `variant?`, `size?`, `onCopied?: () => void`) |
| `status-node.tsx` | `StatusNode` (`state: NodeState`, `size?: 'sm' \| 'md'`, `label?: string`), `NODE_LABELS: Record<NodeState, string>`, `type NodeState = 'draft' \| 'pending_review' \| 'approved' \| 'scheduled' \| 'ready' \| 'publishing' \| 'published' \| 'failed' \| 'skipped'`. `QueueStatus` values map one to one, and a draft with no queue item is `'draft'` |
| `timeline.tsx` | `Timeline`, `TimelineItem` (`node: ReactNode`, `children`, `last?: boolean`). The vertical rail that connects StatusNodes |
| `theme.tsx` | `ThemeProvider` (next-themes, `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`), `ThemeToggle` (`SegmentedControl` with Light, Dark and System) |
| `visually-hidden.tsx` | `VisuallyHidden` |

`components/loading-spinner.tsx` keeps exporting `LoadingSpinner` (`label?`, `className?`) for compatibility. It wraps `Spinner`.

Brand (`components/brand/*`):
```ts
// logo.tsx
export function LogoMark(props: { size?: number; className?: string }): JSX.Element   // the commit-node mark, currentColor + accent
export function Wordmark(props: { className?: string }): JSX.Element                    // "CommitFlex", single colour
export function Logo(props: { href?: string; className?: string; showWordmark?: boolean }): JSX.Element
// platform.tsx
export type BrandPlatform = 'linkedin' | 'twitter' | 'github'
export function PlatformIcon(props: { platform: BrandPlatform; className?: string; title?: string }): JSX.Element   // inline SVG brand marks
export function PlatformBadge(props: { platform: 'linkedin' | 'twitter'; className?: string }): JSX.Element        // icon + 'LinkedIn' | 'X'
export function platformLabel(p: 'linkedin' | 'twitter'): 'LinkedIn' | 'X'
export const PLATFORM_CHAR_LIMIT: { linkedin: 3000; twitter: 280 }
```

Shell:
```ts
// components/app-shell.tsx (async server component)
export async function AppShell(props: {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null }
  children: React.ReactNode
  width?: 'default' | 'wide' | 'narrow'   // max-w-[1120px] | max-w-[1360px] | max-w-[760px]
}): Promise<JSX.Element>
  // Fetches getUserPlan(user.id) and getQueueStats(user.id), each wrapped in try/catch with fallbacks (free plan, zero counts).
  // Renders AppSidebar (desktop), a mobile top bar with a Sheet nav, and <main id="main"> inside <UpgradeProvider>. Includes a skip link.
// components/app-sidebar.tsx ('use client')
export function AppSidebar(props: { user: {...}; plan: { id: PlanId; status: PlanStatus }; counts: { review: number; ready: number }; variant?: 'desktop' | 'sheet' }): JSX.Element
export const APP_NAV: { href: string; label: string; icon: LucideIcon; countKey?: 'review' | 'ready' }[]
```
Navigation in order: Today `/dashboard` (`House`), Queue `/queue` (`ListChecks`, count = review + ready), Calendar `/calendar` (`CalendarDays`), Drafts `/drafts` (`FileText`), Repositories `/repositories` (`FolderGit2`), Analytics `/analytics` (`ChartNoAxesColumn`). A secondary group: Extension `/extension` (`Puzzle`), Billing `/billing` (`CreditCard`), Settings `/settings` (`Settings`). The sidebar's primary button is **Draft a post**, linking to `/drafts/new`. The footer has a user menu (Avatar and name; menu items: Settings, Billing, theme toggle, Sign out). Free and trialing users see a compact plan row ("Pro trial, 9 days left" or "Free plan") with **Upgrade** linking to `/billing`. **The old `AppShell` export in `app-sidebar.tsx` is removed.** Every page imports `AppShell` from `@/components/app-shell`.

`app/layout.tsx`: fonts (section 7.2), `<ThemeProvider>`, `<TooltipProvider>`, `<Toaster />`, metadata title template `'%s · CommitFlex'` with default `'CommitFlex: your commits, posted'`, a description, and `suppressHydrationWarning` on `<html>`. `app/not-found.tsx` and `app/error.tsx` use `EmptyState` and `ErrorState` in a centred narrow column with the logo.

---

## 6. API routes

Auth types: **session** means `auth()` and `session.user.id`, otherwise 401. **token** means `authenticateApiToken(req, 'extension')`, otherwise 401. **cron** means `Authorization: Bearer ${CRON_SECRET}`, otherwise 401, and 503 when `CRON_SECRET` is unset in production. **signature** means HMAC. **approval** means a one-time approval token in the query string. Dates in JSON are ISO strings. Every POST, PUT and PATCH body is validated with zod. Plan errors are 402 with `PlanErrorBody`.

### P3: generation, drafts, queue, autopilot, integrations, cron, webhooks
| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/generate` | session | `CreateJobSchema` (existing union) + `voiceProfileId?: uuid` | `202 { jobId }` | 400, 402 `limit_reached`, 403, 404, 409 `active_job`, 412 `no_github_token`, 429, 503 `circuit_open` |
| `GET /api/generate` | session | | `{ jobs }` | 401 |
| `GET /api/jobs/:jobId` | session | | `{ job, drafts, repo, queue: QueueItemView[] }` | 403, 404 |
| `DELETE /api/jobs/:jobId` | session | | 204 | 403, 404 |
| `GET /api/jobs/:jobId/stream` | session | | SSE `update` events `{ status, drafts }` (existing) | |
| `PATCH /api/drafts/:draftId` | session | `{ content: string(1..5000) }` | `{ draft }` | 400, 403, 404 |
| `POST /api/drafts/:draftId` | session | | 204 (mark copied, existing) | |
| `POST /api/drafts/:draftId/replace` | session | existing | existing, and counts 1 generation | 402 |
| `POST /api/drafts/:draftId/variants` | session | `GenerateVariantsSchema` | existing | 402 `feature_locked` (`drafts.variants`) or `limit_reached` |
| `POST /api/drafts/:draftId/approve` | session | `{}` | `{ item: QueueItemView }` | 403, 404, 409 `invalid_state` |
| `POST /api/drafts/:draftId/schedule` | session | `{ at?: ISO string }` (omitted means next free slot) | `{ item }` | 400 `in_past`, 402 `limit_reached` (`queuedPosts`), 409 `slot_taken` |
| `DELETE /api/drafts/:draftId/schedule` | session | | `{ item }` (back to `approved` or `pending_review`, `scheduledFor` null) | 404 |
| `POST /api/drafts/:draftId/skip` | session | | `{ item }` | 404 |
| `POST /api/drafts/:draftId/publish` | session | `{}` | `{ item, result: PublishResult }`. LinkedIn with connection and feature: published through the API. Otherwise `status: 'ready'` and `result.intentUrl` | 402 (when `linkedin_api` is explicitly requested without the feature), 409 `linkedin_not_connected` (never fatal, falls back to ready), 502 `upstream_error` |
| `POST /api/drafts/:draftId/posted` | session | `{ method: 'x_intent' \| 'manual', url?: string }` | `{ item }` | 404 |
| `GET /api/drafts/approve?token=` | approval | | `303` to `/queue/approved?status=approved\|already\|expired\|invalid&draft=<id>&platform=<p>&at=<ISO>` | none (always redirects) |
| `GET /api/autopilot/settings` | session | | `{ settings: AutopilotSettings, nextSlots: string[] /* next 5 */, plan: { id, status } }` | |
| `PUT /api/autopilot/settings` | session | `Partial<AutopilotSettings>` minus `timezone` | `{ settings, nextSlots }` | 400, 402 (`autopilot.cadence` for non-`ship_moments` cadence, `publish.auto_approve` for auto, `team.reviewers` or `reviewers` limit) |
| `GET /api/autopilot/queue` | session | query `status` (comma list), `platform`, `from`, `to`, `limit` (max 200) | `{ items: QueueItemView[], stats: QueueStats }` | 400 |
| `POST /api/autopilot/run` | session | `{ repoId?: uuid }` (default: most recently active autopilot repo) | `202 { jobId }` | 402, 404, 409 |
| `GET /api/autopilot/ship-events` | session | `limit?` | `{ events: ShipEventView[] }` | |
| `GET /api/integrations` | session | | `{ linkedin: LinkedInConnectionSummary \| null, linkedinAvailable: boolean, github: { login: string \| null, scopes: string[] } }` | |
| `GET /api/integrations/linkedin/connect?returnTo=` | session | | 302 to LinkedIn authorize (returnTo must start with `/`) | 503 `not_configured` |
| `GET /api/integrations/linkedin/callback?code&state` | session + state cookie | | 302 to `returnTo ?? '/settings?tab=connections'` + `&linkedin=connected\|denied\|error` | |
| `POST /api/integrations/linkedin/disconnect` | session | | `{ ok: true }` | |
| `GET /api/notifications` / `PUT` | session | existing fields + `approvalRequests`, `readyToPost`, `publishReceipts` | `{ prefs }` | 400 |
| `GET /api/repos` / `POST` | session | POST: existing body | POST `201 { repo, warning? }`. Installs the hook with events `['push','pull_request','release']` | 402 `limit_reached` (`repos`), 409 `already_connected` |
| `PATCH /api/repos/:repoId` | session | `{ autoGenerate?: boolean, autopilotEnabled?: boolean }` | `{ repo }` | 402 (enabling autopilot beyond the repos limit) |
| `DELETE /api/repos/:repoId` | session | | existing | |
| `POST /api/repos/:repoId/webhook` | session | `{}` | `{ repo }` (hook created or updated to all 3 events) | 502 `upstream_error` (with GitHub message) |
| `GET /api/github/repos` | session | | `{ repos }` (existing + `pushedAt`, `stars`) | |
| `POST /api/webhooks/github` | signature (per-repo secret) | GitHub `push`, `pull_request`, `release`, `ping` | `200 { ok, ignored? }` or `202 { ok, jobId }` | 400, 401, 429 |
| `GET /api/cron/autopilot` | cron | | `{ ok: true, digests: number, cadenceJobs: number, reminders: number, trialEmails: number, linkedinExpiryEmails: number, durationMs: number }` | 401 |
| `GET /api/cron/publish` | cron | | `{ ok: true, published: number, ready: number, retried: number, failed: number, durationMs: number }` | 401 |

`POST` is accepted on both cron routes as an alias, because some schedulers only send POST.

### P2: onboarding, user, voice
| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/onboarding` | session | (side effect: creates the `user_profiles` row with the timezone from the `tz` query param if it is missing, then calls `startTrialIfEligible`) query `tz?` | `{ profile: UserProfile, autopilot: AutopilotSettings, repos: { id, fullName }[], linkedin: LinkedInConnectionSummary \| null, linkedinAvailable: boolean, plan: { id, status } }` | |
| `PATCH /api/onboarding` | session | `{ step?: OnboardingStep, role?, pitch?, audiences?, platforms?, tonePreset?, timezone?, voiceSamples?: string[], cadence?, postTime?, approvalMode? }` | `{ profile }` | 400 |
| `POST /api/onboarding/complete` | session | `{ role, pitch?, audiences (1..2), platforms (1..2), tonePreset, voiceSamples?: string[] (0..10, 40..5000 chars each), cadence, postTime, approvalMode, timezone }` | `{ ok: true, jobId: string \| null, trialEndsAt: string \| null, redirectTo: '/dashboard' }` | 400, 409 `no_repos` |
| `GET /api/user` | session | | `{ user: { id, name, email, image }, profile, plan: { id, status, trialEndsAt } }` | |
| `DELETE /api/user` | session | | `{ ok: true }` (also cancels a live Razorpay subscription immediately, best-effort, via `cancelSubscription`) | |
| `PATCH /api/user/profile` | session | `{ role?, pitch?, audiences?, platforms?, tonePreset?, timezone? }` | `{ profile }` | 400 |
| existing `/api/voice/**` | session | unchanged, plus `POST /api/voice/profiles` checks the `voiceProfiles` limit | unchanged | 402 `limit_reached` |

### P5: billing
| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/billing/status` | session | | `{ plan: { id, name, status, interval, currency, currentPeriodEnd, trialEndsAt, cancelAtPeriodEnd }, usage: UsageSnapshot, suggestedCurrency: Currency, configured: boolean }` | |
| `POST /api/billing/checkout` | session | `{ plan: 'pro' \| 'team', interval: 'month' \| 'year', currency?: 'INR' \| 'USD' }` | `{ keyId, subscriptionId, plan, interval, currency, amount /* major units */, name: 'CommitFlex', description: 'Pro, monthly', prefill: { name, email } }` | 400, 409 `already_subscribed` (same plan and interval already entitled), 503 `not_configured` or `currency_unavailable`, 502 `upstream_error` |
| `POST /api/billing/verify` | session | `{ razorpay_payment_id, razorpay_subscription_id, razorpay_signature }` | `{ ok: true, plan: Plan['id'], status }` | 400 `invalid_signature`, 404 (subscription not owned by the user) |
| `POST /api/billing/cancel` | session | `{ atPeriodEnd?: boolean }` (default true) | `{ ok: true, cancelAtPeriodEnd: boolean, currentPeriodEnd: string \| null }` | 404 `no_subscription`, 502 |
| `GET /api/billing/invoices` | session | | `{ invoices: { id, amount, currency, status, date, url }[] }` | |
| `POST /api/webhooks/razorpay` | signature (`X-Razorpay-Signature`, `RAZORPAY_WEBHOOK_SECRET`) | raw Razorpay event | `200 { ok: true, duplicate? }` | 400 `invalid_signature`, 503 `not_configured` |

### P6: extension
All token routes also answer `OPTIONS` with 204 and CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Authorization, Content-Type`, `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`). Token routes never read cookies.

| Method and path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/extension/whoami` | token | | `{ user: { id, name, email, image }, plan: { id, name, status }, usage: { generations: { used, max } }, appUrl }` | 401 |
| `GET /api/extension/queue?platform=` | token | `platform?: 'linkedin' \| 'twitter'` | `{ queue: ExtensionItem[], recent: ExtensionItem[] }`. `queue` holds ready, scheduled and pending_review items (ready first). `recent` holds the last 10 unqueued drafts | 401 |
| `POST /api/extension/drafts/:draftId/posted` | token | `{ url?: string }` | `{ ok: true, item: ExtensionItem }` | 401, 404 |
| `POST /api/extension/draft-from-github` | token | `{ url: string }` | `202 { jobId, kind: 'pr' \| 'release' \| 'repo', repoFullName, jobUrl }` | 400 `unsupported_url`, 402, 404 `repo_not_connected` (with `connectUrl: '/repositories'`), 409 `active_job` (with `jobId`) |
| `GET /api/extension/jobs/:jobId` | token | | `{ status, drafts: ExtensionItem[] }` | 401, 404 |
| `GET /api/extension/tokens` | session | | `{ tokens: ApiTokenSummary[], limit: { used, max } }` | |
| `POST /api/extension/tokens` | session | `{ name?: string }` (default "Chrome on {date}") | `201 { token: string /* shown once */, summary: ApiTokenSummary }` | 402 `limit_reached` (`extensionTokens`) |
| `DELETE /api/extension/tokens/:tokenId` | session | | 204 | 404 |

```ts
interface ExtensionItem { draftId: string; queueItemId: string | null; platform: 'linkedin' | 'twitter'; status: QueueStatus | 'draft';
  text: string /* composePostText(content, hashtags, platform) */; repoFullName: string; scheduledFor: string | null; createdAt: string;
  intentUrl: string; appUrl: string /* `${appUrl()}/jobs/${jobId}` */ }
```

---

## 7. Design system (F1 implements; everyone uses it)

### 7.1 Direction: "the ship log"
CommitFlex treats your work as a changelog that turns into a publishing schedule. The single memorable device is the **commit-node rail**: drafts, queue items and timeline entries hang off a thin vertical rail as nodes, and each node's shape shows its state, like commits on a branch. Everything else stays quiet and disciplined: a cool porcelain page, ink-dark type, one ultramarine accent, and a highlighter yellow ("marker") that only ever marks text CommitFlex pulled from your commits. The identity is deliberately different from ResumeMax, which uses warm white, pastel tool tints and Manrope: CommitFlex is cooler, denser, more editorial and closer to engineering tools.

Never use: gradient blobs or meshes, particle, sparkle or smoke backgrounds, purple-to-pink gradients, glassmorphism panels, emoji as icons, a two-colour wordmark, accenting a single word in headlines, ALL-CAPS tracked eyebrow labels, `·`-joined meta strings as decoration, `→` appended to button text, monospace for non-code labels, or walls of identical cards. Use lists, tables and rails instead of card grids.

### 7.2 Typography (`next/font/google`, set in `app/layout.tsx`)
- `Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })` is used for all UI and marketing text. It is a newsroom grotesk that fits a publishing tool. Weights: 400 body, 500 UI emphasis, 600 headings, 700 display and wordmark.
- `JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })` is used **only** for git data: SHAs, branch and tag names, repo slugs inside code contexts, tokens, keyboard keys and code.
- Delete the Geist local fonts and Inter. `app/fonts/` may be emptied.
- Tailwind `fontFamily`: `sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif']`, `mono: ['var(--font-mono)', 'ui-monospace', 'monospace']`.

Type scale. F1 overrides the Tailwind `fontSize` keys, so builders use the standard class names:

| Class | Size / line-height | Tracking | Use |
|---|---|---|---|
| `text-xs` | 12 / 16 | 0 | captions, meta, table footnotes |
| `text-sm` | 13 / 20 | 0 | dense UI: table cells, sidebar, inputs (sm), badges (13 for md badges) |
| `text-base` | 15 / 24 | 0 | default body and inputs |
| `text-lg` | 18 / 28 | -0.005em | lead paragraphs, card titles in marketing |
| `text-xl` | 22 / 28 | -0.01em | section titles in the app, dialog titles |
| `text-2xl` | 28 / 34 | -0.015em | app page titles (`PageHeader`) |
| `text-3xl` | 36 / 40 | -0.02em | marketing section headings |
| `text-4xl` | 48 / 50 | -0.025em | pricing hero, marketing H1 on small pages |
| `text-5xl` | 64 / 64 | -0.035em | landing hero (use `clamp(40px, 7vw, 64px)` via `text-[length:clamp(40px,7vw,64px)]` or a `.text-display` utility F1 adds) |

Rules: sentence case everywhere. Body line length is at most 72ch (`max-w-prose` is set to `68ch`). Numbers in tables and stats use `tabular-nums`. Headings are left-aligned. Only the empty, error and 404 states centre text.

### 7.3 Colour tokens
CSS variables hold RGB channels (`--c-…: R G B`), and Tailwind colours are `rgb(var(--c-…) / <alpha-value>)`, so opacity modifiers work. Light is `:root` and dark is `.dark`. `darkMode: 'class'`, and next-themes sets the class.

| Tailwind name | Variable | Light | Dark | Use |
|---|---|---|---|---|
| `canvas` | `--c-canvas` | `#F4F5F8` | `#0E1120` | page background |
| `surface` | `--c-surface` | `#FFFFFF` | `#151A2C` | cards, panels, popovers, inputs |
| `sunken` | `--c-sunken` | `#ECEEF3` | `#0A0D19` | wells, code blocks, segmented-control track, table header |
| `line` | `--c-line` | `#DDE1E9` | `#262C44` | hairlines, borders |
| `line-strong` | `--c-line-strong` | `#C4CAD6` | `#39415E` | input borders, rails, hovered borders |
| `fg` | `--c-fg` | `#10131F` | `#EDEFF7` | primary text |
| `fg-muted` | `--c-fg-muted` | `#4A5063` | `#A7AEC2` | secondary text |
| `fg-subtle` | `--c-fg-subtle` | `#6B7286` | `#7D859B` | meta, placeholders, disabled |
| `accent` | `--c-accent` | `#2B3FE0` | `#7B87FF` | primary buttons, links, focus, selected |
| `accent-hover` | `--c-accent-hover` | `#2233C4` | `#95A0FF` | primary hover |
| `accent-soft` | `--c-accent-soft` | `#E9ECFF` | `#1D2352` | selected rows, accent badges, active nav |
| `accent-ink` | `--c-accent-ink` | `#1F2EA8` | `#B9C0FF` | accent text on soft backgrounds |
| `accent-fg` | `--c-accent-fg` | `#FFFFFF` | `#0E1120` | text on accent fills |
| `marker` | `--c-marker` | `#FFF07A` | `#4F480C` | highlighter behind text taken from commits, "new" marks |
| `marker-fg` | `--c-marker-fg` | `#3D3500` | `#FFF3A0` | text on marker |
| `success` / `success-soft` | `--c-success`, `--c-success-soft` | `#0F7B54` / `#E3F5EC` | `#3DD68C` / `#0F2E22` | published, connected |
| `warning` / `warning-soft` | `--c-warning`, `--c-warning-soft` | `#A15C00` / `#FFF2DB` | `#F2B04A` / `#33260C` | needs review, near limit |
| `danger` / `danger-soft` | `--c-danger`, `--c-danger-soft` | `#C8323C` / `#FDE8E9` | `#FF6B73` / `#3A1519` | failed, destructive |
| `linkedin` | `--c-linkedin` | `#0A66C2` | `#4C9AEA` | LinkedIn mark only |
| `x` | `--c-x` | `#10131F` | `#EDEFF7` | X mark only |

`body` gets `bg-canvas text-fg antialiased`. Selection: `::selection { background: rgb(var(--c-marker)); color: rgb(var(--c-marker-fg)); }`. Platform colours appear only in platform icons and badges, never as decoration.

### 7.4 Spacing, radius, elevation
- **Spacing:** Tailwind's default 4px scale. Layouts use only 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20 and 24. Card padding is `p-5` (desktop) or `p-4` (mobile). Gaps between page sections are `gap-8` (app) and `py-20 md:py-28` (marketing sections). Form fields use `gap-5`. Inline icon and text gaps are `gap-1.5` (sm) and `gap-2` (md).
- **Page container:** app `mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-10 py-6 lg:py-10`. Marketing `mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8`.
- **Radius** (F1 overrides the keys): `rounded-sm` 4px (badges, kbd, marker), `rounded-md` 6px (buttons, inputs, menu items), `rounded-lg` 10px (cards, popovers, panels), `rounded-xl` 14px (dialogs, sheets, the marketing demo frame), `rounded-full` (avatars, status nodes, switches). Never put the same large radius on nested elements: an inner element's radius is the outer radius minus the padding, or `rounded-md`.
- **Elevation** (F1 overrides `boxShadow`): `shadow-xs` `0 1px 0 rgb(16 19 31 / 0.04)` (resting cards, optional), `shadow-sm` `0 1px 2px rgb(16 19 31 / 0.06), 0 1px 1px rgb(16 19 31 / 0.04)` (buttons and secondary), `shadow-md` `0 8px 24px -8px rgb(16 19 31 / 0.18), 0 2px 6px rgb(16 19 31 / 0.06)` (popovers, menus, toasts), `shadow-lg` `0 24px 48px -16px rgb(16 19 31 / 0.28)` (dialogs, sheets). In dark mode the shadow colour is `rgb(0 0 0 / x)` at 2x opacity. Borders (`border-line`) carry the structure, and shadows are reserved for floating layers.
- **Focus:** F1 adds a `focus-ring` utility in `@layer utilities`: `outline-none` plus `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-canvas` (inside surfaces use `ring-offset-surface`). Every focusable custom element must use it.
- **Breakpoints:** Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Everything must work at 375px with no horizontal scroll. Tables become stacked rows below `md`. The sidebar collapses into the top bar plus a Sheet below `lg`.

### 7.5 Component look (F1)
- **Buttons:** heights `sm` h-8 (text-sm), `md` h-9 (text-sm, font-medium), `lg` h-11 (text-base). Horizontal padding is 12, 14 or 18px. The primary button is an accent fill with accent-fg text, `shadow-sm`, and accent-hover on hover. Secondary is surface with a `border-line-strong` and an fg text hover tint of `bg-sunken`. Ghost has no border and `hover:bg-sunken`. Danger is a danger fill with white text (dark mode: canvas text). Press feedback is `active:translate-y-px`. No hover lift and no glow. Icons are 16px lucide at `strokeWidth={1.75}`.
- **Inputs:** h-9, `bg-surface`, `border-line-strong`, `rounded-md`, placeholder `text-fg-subtle`. The focus state is `border-accent` plus the focus ring. The invalid state is `border-danger`, with the message in `text-sm text-danger` below.
- **Cards:** `bg-surface border border-line rounded-lg`. Clickable cards hover to `border-line-strong`. No transform.
- **Badges:** h-5 (sm) or h-6 (md), `rounded-sm`, text-xs or text-sm, font-medium, soft background with ink text.
- **StatusNode** (12px sm, 16px md, drawn in SVG):

  | State | Glyph |
  |---|---|
  | draft | hollow, `line-strong` stroke |
  | pending_review | warning ring with a 4px warning centre dot |
  | approved | ring half-filled accent (left half) |
  | scheduled | accent ring with an accent centre dot |
  | ready | solid accent fill with an accent-fg centre dot |
  | publishing | accent ring with a 90° arc rotating at 900ms linear (static under reduced motion) |
  | published | solid success with a white check (8px) |
  | failed | solid danger with a white × |
  | skipped | dashed `line-strong` ring |

  It always has an accessible name via `NODE_LABELS`: "Draft", "Needs review", "Approved", "Scheduled", "Ready to post", "Publishing", "Published", "Failed", "Skipped".
- **Timeline rail:** a 1px `bg-line-strong` line centred under the nodes. A node sits on a 2px `ring-surface` so the line appears to pass behind it.
- **Marker highlight:** `.marker` utility: `bg-marker text-marker-fg rounded-sm px-0.5 box-decoration-clone`.
- **Empty states:** a 40px icon in a `bg-sunken rounded-lg` 56px square, a `text-lg` title, a `text-fg-muted` description of at most 2 lines, and a primary action. Left-aligned inside panels. Centred only for full-page empty states.
- **Skeletons:** `bg-sunken` with a 1.2s opacity pulse (0.6 to 1). They match the content's shape: rows for lists, blocks for editors.

### 7.6 Layout patterns
- **App page:** a `PageHeader` (title, a description of at most one line, actions on the right; stacked below `sm`), then content. The Today dashboard is two columns on `xl` (main 2/3: "Needs your review" list plus "Up next" timeline; side 1/3: autopilot status, usage, setup checklist) and one column below.
- **Lists over cards:** queue, drafts and repositories are rows in a single bordered container (`divide-y divide-line`), not separate cards. Queue rows sit on the commit-node rail.
- **Editors** open in a `Sheet` (right, `lg` size) from lists, so the list keeps its context.
- **Settings:** `FormSection` rows (a 280px label column and the controls) separated by `Separator`, with tabs at the top (`Tabs`, synced to `?tab=`).
- **Marketing:** a left-aligned hero with copy on the left (5 of 12 columns) and the live demo frame on the right (7 of 12). Sections alternate full-width content with generous whitespace. No centred-everything layout. The pricing table is three columns on `lg`, with the recommended plan marked by an accent border and a "Recommended" badge, not by scale or glow.

### 7.7 Motion
- Durations: 120ms (hover, press, colour), 180ms (popover, tooltip, menu enter), 240ms (dialog, sheet enter), 160ms (exits). Easing: `cubic-bezier(0.2, 0, 0, 1)` for enter and `cubic-bezier(0.4, 0, 1, 1)` for exit. F1 exposes them as Tailwind `transitionTimingFunction` keys `out` and `in`, and `transitionDuration` keys `120`, `180`, `240`.
- Base UI transitions use `data-[starting-style]` and `data-[ending-style]` (opacity 0, plus `translate-y-1` for popovers or `scale-[0.98]` for dialogs, or `translate-x-4` for sheets).
- Only one orchestrated sequence is allowed on the landing page: the hero demo, where a merged PR line becomes a draft and then a scheduled node. It plays once on load and replays on a button press. Use `motion/react`. No scroll-triggered fade-ups on every section. No ambient loops anywhere.
- In the app, motion only responds to user actions (a queue item moving to Scheduled animates its node state, and a list row reorder uses `motion` `layout`). Everything respects `prefers-reduced-motion: reduce`, which turns off transforms and keeps opacity fades of 120ms or less.

### 7.8 Voice and tone of UI copy
- Plain, specific and calm, like a sharp senior engineer explaining something. Sentence case. No exclamation marks, no emoji and no hype words ("supercharge", "unleash", "magic", "effortless", "seamless", "AI-powered").
- Name things by what users understand: **Queue**, **Calendar**, **Autopilot**, **Ship moments**, **Voice**, **Drafts**, **Repositories**. Not "jobs" or "pipelines", except on the job progress page, which says "Writing your drafts".
- Actions keep the same verb through the flow: Approve leads to "Approved", Schedule to "Scheduled for Tue, 9:30", Publish now to "Published to LinkedIn", Post on X opens X and then "Marked as posted", and Skip to "Skipped".
- Errors say what happened and what to do: "LinkedIn rejected the post because your connection expired. Reconnect LinkedIn and we'll retry." Never "Oops" or "Something went wrong" alone.
- Empty states invite an action: "Nothing waiting for review. Merge a pull request or run autopilot now." with the button **Draft something now**.
- Dates use relative time for under 7 days ("in 3 hours", "yesterday at 18:00"), then `EEE, d MMM` (date-fns). Always use the user's profile timezone, and show the timezone abbreviation in schedule pickers.

---

## 8. Integration order and checks

1. F1 and F2 run first and in parallel. F2 must finish `package.json` and the install, the schema and migration, `lib/plans.ts`, `lib/billing/catalog.ts` and `lib/env.ts` before anything else.
2. P1 to P6 then run in parallel against these contracts.
3. The orchestrator runs `pnpm tsc --noEmit`, `pnpm vitest run` and `pnpm build`. The build must pass with only placeholder env values: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `GEMINI_API_KEY` set, and everything optional unset. Pages that read the database must be dynamic (they use `auth()`) and must not query at build time.
