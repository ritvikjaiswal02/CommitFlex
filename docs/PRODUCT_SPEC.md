# CommitFlex product spec: build in public on autopilot

Status: binding for the `redesign-autopilot` branch. Builders implement this spec. `docs/BUILD_CONTRACTS.md` holds the exact schema, signatures, routes and design tokens. Where the two documents disagree, BUILD_CONTRACTS wins.

---

## 1. Positioning

**One line:** CommitFlex turns what you ship on GitHub into LinkedIn and X posts in your own voice, then queues and publishes them for you.

**Promise on the landing page:** "You shipped it. CommitFlex writes the post." Connect GitHub, answer five questions, and approve drafts from your inbox. CommitFlex handles the writing, scheduling and posting.

**What changes from today.** Today CommitFlex is a generator. You pick a repo, pick a date range, click Generate, copy the result and paste it into LinkedIn or X yourself. In the new version CommitFlex runs on its own:

| Today (manual) | Autopilot |
|---|---|
| You decide when to generate | Ship moments (a merged PR, a published release, the weekly digest) and your posting cadence decide |
| Drafts sit on a job page | Drafts go into a queue with a time slot |
| You copy and paste into LinkedIn or X | LinkedIn posts go out through the official API. X posts open pre-filled in one tap, and the Chrome extension fills both composers |
| No reminders | An approval email with a one-click Approve button for every draft |
| Free and unlimited, no business model | Free, Pro and Team plans through Razorpay, in INR and USD |

**Category:** developer-focused social publishing. The nearest tools are general schedulers (Buffer, Typefully, Taplio). None of them reads your repositories. CommitFlex's edge is that the content comes from your real work, so you don't have to come up with ideas.

## 2. Ideal customer

Primary (paying):
1. **Indie hackers and solo founders** who build in public and know distribution matters, but lose an evening a week to writing posts. They ship often, and they pay for anything that saves time and grows their audience.
2. **Engineers growing a personal brand for their career**, such as people looking for a job, aiming for senior roles or doing freelance work. A steady LinkedIn presence backed by real shipped work is their portfolio.
3. **Open-source maintainers** who want release announcements to reach users without writing three versions of the changelog.

Secondary (Team plan):
4. **Small product teams and DevRel** (2 to 10 people) who want each release turned into posts that a lead reviews before they go out.

Not a fit: agencies managing dozens of client brands, and non-developers without GitHub activity.

Geography: India first (INR pricing, UPI and cards through Razorpay), with global USD pricing from day one.

## 3. The problem

- Developers ship every week, and almost none of that work becomes a post. The context is in the commit log, but turning `fix: race in webhook retry` into a post someone wants to read takes 20 to 40 minutes, so it doesn't get written.
- When they do post, it happens in bursts and then stops. Posting regularly is what grows an audience, and doing it by hand isn't sustainable.
- Generic AI writers sound generic. They don't know what you built, and they don't sound like you.
- Copy-paste workflows lose posts. A draft that isn't scheduled never goes out.

CommitFlex removes the four steps that stop people: noticing something worth posting, writing it, deciding when to post it, and posting it.

## 4. Onboarding (sign up, then five questions)

The route is `/onboarding`. It is a full-screen stepper with a progress rail on the left (desktop) or a top progress bar (mobile), one question per screen, and Back and Continue buttons. Every answer is saved as you go (`PATCH /api/onboarding`), so a refresh resumes where you left off. The whole flow should take under two minutes.

Steps 0 and 1 come before the questions. The questions use this exact copy:

### Step 0: Sign in
- Title: **Sign in with GitHub to get started**
- Body: "CommitFlex reads commit messages, pull request titles and release notes from the repos you choose. It never reads or stores your source code."
- Button: **Continue with GitHub**
- Small print: "We ask for repository access so we can read private repos you select and add a webhook that tells us when you ship. You can disconnect any repo at any time."

### Step 1: Pick your repos
- Title: **Which repos should CommitFlex watch?**
- Helper: "Pick the projects you'd talk about publicly. We'll add a webhook so merged pull requests and releases reach us automatically."
- UI: a searchable list of your GitHub repos showing language, visibility and last update. Multi-select, limited by the plan's `repos` limit. Free users choose 1 repo. During the trial users choose up to 10, and if they pick more than 1 they see the note: "Your trial includes 10 repos. On the Free plan we'll keep watching the first one."
- Validation: select at least one repo. Error copy: "Pick at least one repo to continue."

### Question 1: Role
- Title: **What best describes you?**
- Options (single select, `role` values in brackets):
  - Indie hacker or founder (`founder`): "Building my own product"
  - Engineer at a company (`engineer`): "Shipping at work, growing my profile"
  - Open-source maintainer (`maintainer`): "Releasing for a community"
  - Freelancer or consultant (`freelancer`): "Showing clients what I build"
  - Student or early-career (`student`): "Building proof of work"
  - Developer advocate (`devrel`): "Explaining what my team ships"
- Optional field below the options: **In one line, what are you building?** Placeholder: "An open-source feature flag service for small teams". Saved as `pitch`, max 160 characters. It is passed to the AI as author context.

### Question 2: Audience
- Title: **Who should your posts reach?**
- Helper: "Pick up to two. This changes what we explain and what we skip."
- Options (multi-select, max 2, `audiences` values):
  - Other developers (`developers`)
  - Recruiters and hiring managers (`recruiters`)
  - Potential customers (`customers`)
  - Founders and investors (`founders`)
  - My project's users (`users`)

### Question 3: Platforms
- Title: **Where do you want to post?**
- Options (multi-select, min 1): LinkedIn (`linkedin`) and X (`twitter`). Each option shows how it gets published:
  - LinkedIn: "Publish directly after you approve. Connect your account now or later."
  - X: "Opens pre-filled in X with one tap, or inserts straight into the composer with the Chrome extension."
- When LinkedIn is selected, the option shows a secondary button **Connect LinkedIn**. It opens `/api/integrations/linkedin/connect?returnTo=/onboarding` and returns to this step with a "Connected as {name}" confirmation. Connecting is optional, and the step can be completed without it.

### Question 4: Voice
- Title: **How should your posts sound?**
- Tone presets (single select, `tone` values):
  - Plain and technical (`plain_technical`): "Says what changed and why it matters. No hype."
  - Story-led (`story_led`): "Opens with the problem, ends with what you learned."
  - Confident founder (`confident_founder`): "Momentum, outcomes, what's next."
  - Teacher (`teacher`): "Explains one idea clearly enough to learn from."
  - Casual (`casual`): "Short, friendly, like a message to a friend."
- Optional textarea: **Paste two or three posts you've written before**. Helper: "We'll match your sentence length, structure and quirks. Separate posts with a blank line." Accepts up to 10 samples of 40 to 5,000 characters each. If at least one sample is given, `analyzeVoiceSamples` runs at completion and the result is stored as the voice fingerprint.
- A live example card shows the same sample commit rewritten in the selected tone. The examples are static and written per preset, so no AI call is made on this screen.

### Question 5: Cadence
- Title: **How often should CommitFlex post for you?**
- Options (single select, `cadence` values):
  - When I ship something notable (`ship_moments`): "Merged pull requests and releases only."
  - Once a week (`weekly`)
  - Twice a week (`twice_weekly`): "Tuesday and Thursday"
  - Three times a week (`three_weekly`): "Monday, Wednesday, Friday"
  - Every weekday (`weekdays`)
- Sub-question: **What time works best?** A segmented control with Morning 9:00 (`09:00`), Midday 12:30 (`12:30`) and Evening 18:00 (`18:00`), followed by "in {detected timezone}" with a **Change** link that opens a timezone select.
- Sub-question: **Before anything goes out…**
  - Email me each draft to approve (`review`), the default.
  - Post automatically and tell me after (`auto`). This requires Pro and is available during the trial. Label it: "Pro, included in your trial".

### Completion
- Button: **Start autopilot**
- `POST /api/onboarding/complete`:
  1. Saves the profile and marks `onboarded_at`.
  2. Confirms the 14-day Pro trial is running. The trial actually starts earlier: the first `GET /api/onboarding` call creates the `user_profiles` row and calls `startTrialIfEligible`, which sets `trial_ends_at = now + 14 days` once per account. That way the repo step already allows up to 10 repos.
  3. Creates or updates the default voice profile from the tone, audiences and fingerprint.
  4. Writes the autopilot settings with `enabled = true`.
  5. Connects the selected repos that aren't connected yet. The client connects repos in step 1 through `POST /api/repos`, so this step only verifies them.
  6. Starts the first job for the most recently pushed selected repo: a 14-day window, trigger `onboarding`, auto-queued.
- Success screen: **Your first drafts are being written.** It shows a live job progress strip (SSE), then sends the user to `/dashboard`. It has secondary links: "Install the Chrome extension" and "Connect LinkedIn" (shown if not connected).

## 5. Automation flows, end to end

Every flow below runs without the user opening the app unless the flow says otherwise.

### Flow A: Sign up to first drafts
1. The user lands on `/` and clicks **Start with GitHub**, which runs GitHub OAuth (Auth.js). New users are redirected to `/onboarding`. The middleware lets the page through, and `/dashboard` redirects there when `user_profiles.onboarded_at` is null.
2. The user completes onboarding (section 4), which starts the trial and the first job.
3. The pipeline runs fetch, summarize, narrative and generate. When the job ends, `enqueueJobDrafts` creates a `queue_items` row per draft. In `review` mode the status is `pending_review` with the next free slot already assigned. In `auto` mode the status is `scheduled`.
4. In `review` mode, an approval email with one Approve link per platform goes to the user and to Team reviewers.
5. The dashboard shows the drafts under "Needs your review".

### Flow B: Merged PR to post (ship moment)
1. GitHub sends a `pull_request` webhook with `action=closed` and `merged=true` to `/api/webhooks/github`. The route verifies the HMAC signature with the repo's secret.
2. A PR is ignored when:
   - the repo has `autopilot_enabled = false`, or the user's autopilot is off or paused
   - `pr_merged` is not in the user's triggers
   - the plan lacks `autopilot.ship_moments`
   - the PR was authored by a bot (`dependabot`, `renovate`, `github-actions` or any login ending in `[bot]`)
   - its title matches `/^(chore|build|ci|deps?|bump|release)(\(.+\))?:/i`
   - it has a label in `dependencies`, `chore`, `skip-changelog` or `no-post`
   - `additions + deletions < 20`
3. The ship moment is deduplicated through `ship_events (repo_id, kind='pr_merged', external_id=PR number)`. If the row already exists, the event is ignored.
4. If no job is active for the repo, the route calls `startGenerationJob({ source: { type: 'pr', ref: html_url }, trigger: 'pr_merged', autoQueue: true })`. This counts toward `generationsPerMonth`. When the user is over the limit, the job isn't created, the ship event is kept with `metadata.skipped = 'limit_reached'`, and a single "You've used this month's drafts" email is sent per month.
5. The job completes, and the drafts are queued into the next free slot (Flow F) and sent for approval (Flow A, step 4).

### Flow C: Release published
The `release` webhook with `action=published` and `prerelease=false`, `draft=false` follows the same path as Flow B with `source: { type: 'release', ref: tag_name }`, trigger `release_published` and dedupe key `release.id`. Release drafts take the earliest free slot ahead of other pending items.

### Flow D: Weekly digest (every plan, including Free)
1. `/api/cron/autopilot` runs. For each user with autopilot enabled, `weekly_digest` in their triggers, and Monday between 06:00 and 23:59 in their timezone, it checks `autopilot_settings.last_digest_at`. If that is older than 6 days:
2. For each autopilot-enabled repo, up to 3 per user and only repos with at least 3 meaningful commits in the last 7 days (after `filterCommits`), it starts a 7-day window job with trigger `weekly_digest` and auto-queue on.
3. It sets `last_digest_at = now`.
4. If no repo had activity, no job runs and no email is sent.

### Flow E: Cadence fill (Pro and Team)
1. On each `/api/cron/autopilot` run, for users whose cadence is not `ship_moments`, the planner computes the slots in the next 48 hours from `post_days`, `post_time` and the profile timezone.
2. For each upcoming slot with no queue item scheduled at that time per platform, the planner starts a window job. The window runs from the last cadence or digest run (or 7 days back, whichever is later) to now, on the repo with the most recent activity that hasn't produced a job in the last 72 hours.
3. If there are no meaningful commits, the slot stays empty. CommitFlex never invents content.

### Flow F: Slot assignment and approval
- **Slots:** `post_days` (0 is Sunday) at `post_time` in the profile timezone. For `ship_moments` cadence, every day at `post_time` counts as a slot. A slot holds at most one item per platform.
- **Review mode:** the item is created as `pending_review` with `scheduled_for` set to the next free slot. Approving it (in the app, by email link or in the extension) moves it to `scheduled`. If the slot passes while the item is still `pending_review`, the next autopilot run moves it to the next free slot and sends one reminder (`reminder_sent_at`).
- **Auto mode** (needs `publish.auto_approve`): the item is created as `scheduled`, and a "Scheduled" summary email lists what goes out and when, with a Skip link per item.
- **Manual drafts** from the dashboard, a job page or the extension are not queued automatically. The user chooses **Add to queue** (next free slot), **Schedule** (pick a time) or **Publish now**.

### Flow G: Publishing
`/api/cron/publish` runs often (see section 9). For every item that is `scheduled` with `scheduled_for <= now`:
- **LinkedIn**, when the user has an active LinkedIn connection and the plan has `publish.linkedin_direct`: the status becomes `publishing`, the post goes to the LinkedIn Posts API, and then the status becomes `published` with the post URL. A publish log row is written and a receipt email sent if `publish_receipts` is on. On a 401 the connection is marked `expired`, the item goes to `ready`, and the user gets a "Reconnect LinkedIn" email. Other errors retry: `attempts` goes up, a retry is scheduled 15 minutes later, and after 3 attempts the item becomes `failed` and the user gets an email.
- **X, or LinkedIn without a connection or plan**: the status becomes `ready`. A "Ready to post" email links straight to the X intent URL or the LinkedIn composer, pre-filled. The extension badge shows the count of `ready` items. When the user posts through the extension, or clicks "I posted it" in the app or the email landing page, the item becomes `published` with method `extension`, `x_intent` or `manual`.

### Flow H: Chrome extension
1. The user opens `/extension`, clicks **Connect extension**, and the page creates a token and hands it to the extension. If the extension isn't installed yet, the page shows install steps and a copy-token fallback.
2. On linkedin.com and x.com, when a post composer opens, a CommitFlex button appears at the composer's corner. It opens a panel listing that platform's `ready`, `scheduled` and `pending_review` items, plus recent unqueued drafts. **Insert** puts the text into the composer at the cursor. After the user's post goes through (the composer closes within 2 minutes of an insert), the extension offers **Mark as posted**.
3. On github.com, merged PR pages and release pages show a **Draft a post** button. It calls `POST /api/extension/draft-from-github`, shows progress, then shows a "Drafts ready" notification that opens `/jobs/{id}`.
4. The popup lists the queue with Copy, Insert into the open tab, and Open in CommitFlex actions.

### Flow I: Billing
1. On `/pricing` or `/billing`, the user clicks **Upgrade to Pro**. That calls `POST /api/billing/checkout`, which creates a Razorpay subscription for the plan ID matching (plan, interval, currency) and returns the subscription ID and key.
2. Razorpay Checkout opens with `subscription_id`. On success the client posts the payment ID, subscription ID and signature to `/api/billing/verify`. The server verifies the HMAC and saves the subscription as `authenticated` or `active`. Entitlements apply right away, and any other live subscription for the user is cancelled immediately.
3. `/api/webhooks/razorpay` handles the subscription lifecycle (`activated`, `charged`, `pending`, `halted`, `cancelled`, `completed`, `paused`, `resumed`) idempotently, keyed by the `x-razorpay-event-id` header. A user-facing email goes out for `activated`, `pending` (payment failed and Razorpay will retry) and `cancelled`.
4. **Cancel** on `/billing` cancels at the end of the period. Access continues until `current_period_end`, then the plan falls back to Free. Free keeps all data, but autopilot ship moments and cadence stop. The weekly digest continues.
5. **Downgrade over limits:** nothing is deleted. Repos beyond the limit get `autopilot_enabled = false`, newest first. Queued items beyond `queuedPosts` stay, but new queueing is blocked until the user is under the limit.

### Flow J: Trial end
On day 11, the autopilot cron sends a "Your trial ends in 3 days" email showing what autopilot did (posts drafted and published). On day 14 `getUserPlan` returns Free automatically, with no job needed. The next autopilot run applies the over-limit rules from Flow I, step 5, and sends a single "Your trial has ended" email with an upgrade link.

### Flow K: LinkedIn connection lifecycle
LinkedIn tokens last 60 days and normal apps get no refresh token. Seven days before `expires_at` the autopilot cron sends a "Reconnect LinkedIn" email. Expired connections show a reconnect banner on `/dashboard` and `/settings?tab=connections`. Publishing falls back to the `ready` handoff, so nothing is lost.

## 6. Feature list mapped to packages

| Feature | Package |
|---|---|
| Design tokens, typography, themes (light and dark), primitives, app shell, sidebar, logo, error and 404 pages | F1 |
| Schema and migration, plan catalog and entitlements, Razorpay client, API tokens, env handling, middleware, cron config | F2 |
| Landing page, pricing page, terms, privacy | P1 |
| Login, onboarding (5 questions), settings (profile, voice, autopilot, connections, notifications, account), voice profiles and fingerprint | P2 |
| Pipeline, startGenerationJob, ship-moment webhooks, weekly digest, cadence planner, queue and slots, approval tokens, LinkedIn OAuth and publishing, X intent links, cron routes, emails, AI prompt quality | P3 |
| Today dashboard, queue, calendar, drafts list, new draft, job page, repositories, analytics, public approval result page | P4 |
| Checkout, verify, cancel, status, Razorpay webhook, billing page, UpgradeDialog, PlanBadge, UsageMeter, PaywallGate, CheckoutButton | P5 |
| Chrome extension (LinkedIn, X and GitHub content scripts, popup, options), extension API, extension connect page | P6 |

## 7. Pricing

Prices are fixed and shown exactly as written. Yearly prices equal 10 months of the monthly price. The currency defaults to the visitor's country (`x-vercel-ip-country = IN` means INR, anything else USD), and visitors can switch on the pricing page.

| Plan | INR monthly | INR yearly | USD monthly | USD yearly | Who it's for |
|---|---|---|---|---|---|
| **Free** | ₹0 | ₹0 | $0 | $0 | Try it with one repo and a weekly digest |
| **Pro** | ₹499 | ₹4,990 | $9 | $90 | Individuals who build in public |
| **Team** | ₹1,999 | ₹19,990 | $29 | $290 | Small teams with a reviewer before posting |

Every new account gets a **14-day Pro trial** that starts on its first visit to onboarding. No card is needed. One trial per account.

### Plan limits

| Limit key | Free | Pro | Team | Counted how |
|---|---|---|---|---|
| `repos` | 1 | 10 | 40 | connected repos where `deleted_at` is null |
| `generationsPerMonth` | 10 | 150 | 600 | `usage_counters` for the calendar month (UTC). Each pipeline run, single-draft regenerate or variants request adds 1 |
| `voiceProfiles` | 1 | 5 | 20 | rows in `voice_settings` |
| `queuedPosts` | 3 | 60 | 250 | `queue_items` in `pending_review`, `approved`, `scheduled` or `ready` |
| `extensionTokens` | 2 | 5 | 20 | `api_tokens` that aren't revoked |
| `reviewers` | 0 | 0 | 5 | length of `autopilot_settings.reviewer_emails` |

### Feature keys

| Feature key | Free | Pro | Team | Meaning |
|---|---|---|---|---|
| `autopilot.weekly_digest` | yes | yes | yes | Weekly digest drafts |
| `autopilot.ship_moments` | no | yes | yes | Drafts from merged PRs and releases |
| `autopilot.cadence` | no | yes | yes | Fixed posting cadence fill |
| `publish.linkedin_direct` | no | yes | yes | Publish to LinkedIn through the API |
| `publish.auto_approve` | no | yes | yes | Approval mode `auto` |
| `drafts.variants` | no | yes | yes | Variants generator (2 to 5 alternatives) |
| `analytics.advanced` | no | yes | yes | 30 and 90 day ranges, per-platform and per-trigger breakdowns |
| `voice.fingerprint` | yes | yes | yes | Voice fingerprint from samples |
| `team.reviewers` | no | no | yes | Up to 5 reviewer emails get approval emails |
| `extension.github_button` | yes | yes | yes | "Draft a post" on GitHub pages |
| `support.priority` | no | no | yes | Priority support line on the billing page |

Free still gets everything needed to see the product working: manual generation, the queue, publish-now handoff to X and LinkedIn, the extension and the weekly digest.

### Paywall behaviour
- The server is the source of truth. A locked feature returns `402 { code: 'feature_locked' }` and a limit returns `402 { code: 'limit_reached' }`. The client opens `UpgradeDialog` with the reason.
- In the UI, locked controls stay visible with a small lock and a "Pro" plan badge. Clicking one opens the dialog. Locked features are never hidden.
- Copy example for a limit: "You've used 10 of 10 drafts this month. Pro includes 150 a month." Buttons: **Upgrade to Pro** and **Not now**.

## 8. UI and UX principles

- Every screen answers "what needs me right now?" first. The Today dashboard leads with drafts waiting for review.
- One primary action per screen. Labels describe exactly what happens: "Approve", "Schedule", "Publish now", "Post on X", "Skip". Toasts reuse the same verb in past tense: "Approved", "Scheduled for Tue, 9:30", "Published to LinkedIn".
- Status always uses the commit-node glyph (see BUILD_CONTRACTS, design system), so a user learns the states once.
- Empty states invite an action. Error states say what failed and how to fix it. Loading states use skeletons shaped like the content.
- No made-up numbers, testimonials or logos anywhere. Marketing demos use CommitFlex's own repository as sample content.

## 9. Operational notes

- **Cron:** `vercel.json` schedules `/api/cron/autopilot` once a day and `/api/cron/publish` once a day, which is compatible with Vercel Hobby. For timely publishing, an external scheduler (cron-job.org, Upstash QStash or a GitHub Actions schedule) should call both endpoints every 10 minutes with `Authorization: Bearer $CRON_SECRET`. Both endpoints are idempotent and safe to call at any frequency.
- **Durability:** pipeline runs are started with `waitUntil` from `@vercel/functions`, so serverless functions finish the work after responding.
- **Webhooks:** repos connected before this release only have the `push` event. The repositories page shows "Update webhook" (`POST /api/repos/:id/webhook`), which switches the hook to `push`, `pull_request` and `release`.

## 10. Success metrics

Everything below can be computed from the tables in BUILD_CONTRACTS. No third-party analytics is needed.

| Metric | Definition | Target (first 90 days) |
|---|---|---|
| Activation | Share of sign-ups with `onboarded_at` set and at least one `queue_items` row reaching `scheduled` or `published` within 48 hours | 45% |
| Time to first draft | From `users` creation (first `accounts` row) to the first `post_drafts.created_at` | Median under 5 minutes |
| Weekly published posts per active user | `queue_items` with `status = 'published'` per user per ISO week, among users with autopilot enabled | 2 or more |
| Approval rate | Approved or scheduled items divided by all autopilot-created items (`pending_review` entries) | 60% or more |
| Time to approve | Median of `approved_at - created_at` for review-mode items | Under 12 hours |
| Trial to paid | Users with an entitled subscription within 7 days of `trial_ends_at`, divided by trials ended | 8% |
| Paid churn | Subscriptions moving to `cancelled` or `halted` per month, divided by active subscriptions at the start of the month | Under 6% |
| Publish reliability | Successful `publish_log` rows with method `linkedin_api` divided by all `linkedin_api` attempts | 98% or more |
| Extension adoption | Users with an `api_tokens` row whose `last_used_at` is within 7 days, divided by weekly active users | 30% |
