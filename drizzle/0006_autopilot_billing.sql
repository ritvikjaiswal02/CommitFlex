CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(60) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(16) NOT NULL,
	"scopes" text[] DEFAULT '{"extension"}' NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"queue_item_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"email" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autopilot_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cadence" varchar(20) DEFAULT 'ship_moments' NOT NULL,
	"post_days" integer[] DEFAULT '{2,4}' NOT NULL,
	"post_time" varchar(5) DEFAULT '09:00' NOT NULL,
	"triggers" text[] DEFAULT '{"pr_merged","release_published","weekly_digest"}' NOT NULL,
	"platforms" text[] DEFAULT '{"linkedin","twitter"}' NOT NULL,
	"approval_mode" varchar(10) DEFAULT 'review' NOT NULL,
	"reviewer_emails" text[] DEFAULT '{}' NOT NULL,
	"default_voice_profile_id" uuid,
	"paused_until" timestamp,
	"last_planned_at" timestamp,
	"last_digest_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) DEFAULT 'razorpay' NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"type" varchar(60) NOT NULL,
	"user_id" text,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"queue_item_id" uuid,
	"draft_id" uuid,
	"platform" varchar(20) NOT NULL,
	"method" varchar(20) NOT NULL,
	"success" boolean NOT NULL,
	"status_code" integer,
	"external_post_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"repo_id" uuid,
	"platform" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending_review' NOT NULL,
	"scheduled_for" timestamp,
	"approved_at" timestamp,
	"approved_by" varchar(255),
	"published_at" timestamp,
	"publish_method" varchar(20),
	"external_post_id" text,
	"external_url" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"last_error" text,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ship_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"repo_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"metadata" jsonb,
	"job_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"email" varchar(255),
	"avatar_url" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" varchar(20) DEFAULT 'razorpay' NOT NULL,
	"plan" varchar(20) NOT NULL,
	"interval" varchar(10) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"razorpay_subscription_id" varchar(64) NOT NULL,
	"razorpay_plan_id" varchar(64) NOT NULL,
	"razorpay_customer_id" varchar(64),
	"last_payment_id" varchar(64),
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" text NOT NULL,
	"period" varchar(7) NOT NULL,
	"metric" varchar(40) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_user_id_period_metric_pk" PRIMARY KEY("user_id","period","metric")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" varchar(30),
	"pitch" varchar(160),
	"audiences" text[] DEFAULT '{}' NOT NULL,
	"platforms" text[] DEFAULT '{"linkedin","twitter"}' NOT NULL,
	"tone_preset" varchar(30),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"country" varchar(2),
	"onboarding_step" varchar(30) DEFAULT 'repos' NOT NULL,
	"onboarded_at" timestamp,
	"trial_ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "trigger" varchar(30) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "voice_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "auto_queue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "autopilot_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "webhook_events" text[] DEFAULT '{"push"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD COLUMN "approval_requests" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD COLUMN "ready_to_post" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD COLUMN "publish_receipts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tokens" ADD CONSTRAINT "approval_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_tokens" ADD CONSTRAINT "approval_tokens_queue_item_id_queue_items_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."queue_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_settings" ADD CONSTRAINT "autopilot_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_settings" ADD CONSTRAINT "autopilot_settings_default_voice_profile_id_voice_settings_id_fk" FOREIGN KEY ("default_voice_profile_id") REFERENCES "public"."voice_settings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_log" ADD CONSTRAINT "publish_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_log" ADD CONSTRAINT "publish_log_queue_item_id_queue_items_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."queue_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_log" ADD CONSTRAINT "publish_log_draft_id_post_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."post_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_draft_id_post_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."post_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ship_events" ADD CONSTRAINT "ship_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ship_events" ADD CONSTRAINT "ship_events_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ship_events" ADD CONSTRAINT "ship_events_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_uidx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_tokens_hash_uidx" ON "approval_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_event_uidx" ON "billing_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "publish_log_user_created_idx" ON "publish_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_items_draft_uidx" ON "queue_items" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "queue_items_user_sched_idx" ON "queue_items" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "queue_items_status_sched_idx" ON "queue_items" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "ship_events_dedupe_uidx" ON "ship_events" USING btree ("repo_id","kind","external_id");--> statement-breakpoint
CREATE INDEX "ship_events_user_created_idx" ON "ship_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connections_user_provider_uidx" ON "social_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_rzp_sub_uidx" ON "subscriptions" USING btree ("razorpay_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_voice_profile_id_voice_settings_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_settings"("id") ON DELETE set null ON UPDATE no action;