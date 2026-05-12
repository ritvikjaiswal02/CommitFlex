CREATE TABLE "accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "ai_generation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt_version" varchar(50) NOT NULL,
	"prompt_commit_hash" varchar(40),
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"prompt_text" text NOT NULL,
	"output_text" text NOT NULL,
	"estimated_cost_usd" numeric(10, 6),
	"duration_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commit_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"message" text NOT NULL,
	"author" varchar(255) NOT NULL,
	"committed_at" timestamp NOT NULL,
	"diff_summary" text,
	"included_in_generation" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commit_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"headline" varchar(500) NOT NULL,
	"key_changes" jsonb NOT NULL,
	"technical_details" text NOT NULL,
	"build_context" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"summary_id" uuid NOT NULL,
	"story" text NOT NULL,
	"angle" varchar(255) NOT NULL,
	"target_audience" varchar(255) NOT NULL,
	"key_insights" jsonb NOT NULL,
	"suggested_hook" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"commit_count" integer DEFAULT 0 NOT NULL,
	"filtered_count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"total_duration_ms" integer,
	"error_message" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"correlation_id" varchar(36) NOT NULL,
	"type" varchar(50) NOT NULL,
	"stage" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"userId" text NOT NULL,
	"narrative_id" uuid,
	"summary_id" uuid,
	"generation_model" varchar(100) NOT NULL,
	"platform" varchar(20) NOT NULL,
	"sequence_number" integer NOT NULL,
	"status" varchar(20) DEFAULT 'generated' NOT NULL,
	"title" text,
	"hook" text,
	"original_content" text NOT NULL,
	"edited_content" text,
	"edited_at" timestamp,
	"content_hash" varchar(64) NOT NULL,
	"generation_stage" varchar(50) NOT NULL,
	"platform_metadata" jsonb NOT NULL,
	"regeneration_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"url" varchar(500),
	"default_branch" varchar(255) DEFAULT 'main' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"preferred_platforms" text[] DEFAULT '{"linkedin","twitter"}' NOT NULL,
	"posting_frequency" varchar(50) DEFAULT 'weekly' NOT NULL,
	"github_installation_id" bigint,
	"repo_owner_type" varchar(10) DEFAULT 'user' NOT NULL,
	"last_analyzed_commit_sha" varchar(40),
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "voice_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"tone" varchar(50) DEFAULT 'professional' NOT NULL,
	"technical_level" integer DEFAULT 7 NOT NULL,
	"audience" varchar(100) DEFAULT 'developers' NOT NULL,
	"extra_context" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voice_settings_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_snapshots" ADD CONSTRAINT "commit_snapshots_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_summaries" ADD CONSTRAINT "commit_summaries_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_narratives" ADD CONSTRAINT "extracted_narratives_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_narratives" ADD CONSTRAINT "extracted_narratives_summary_id_commit_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."commit_summaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_narrative_id_extracted_narratives_id_fk" FOREIGN KEY ("narrative_id") REFERENCES "public"."extracted_narratives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_drafts" ADD CONSTRAINT "post_drafts_summary_id_commit_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."commit_summaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD CONSTRAINT "voice_settings_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logs_job_idx" ON "ai_generation_logs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "snapshots_job_idx" ON "commit_snapshots" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_user_created_idx" ON "generation_jobs" USING btree ("userId","created_at");--> statement-breakpoint
CREATE INDEX "events_job_idx" ON "pipeline_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "events_corr_idx" ON "pipeline_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "drafts_job_idx" ON "post_drafts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "drafts_hash_idx" ON "post_drafts" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "repos_user_idx" ON "repos" USING btree ("userId");