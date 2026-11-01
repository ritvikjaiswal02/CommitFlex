CREATE TABLE "rate_limit_buckets" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trial_claims" (
	"github_account_id_hash" varchar(64) PRIMARY KEY NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publish_log" ALTER COLUMN "success" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_tokens" ADD COLUMN "actions" text[] DEFAULT '{"approve"}' NOT NULL;--> statement-breakpoint
-- Links already sent to the account owner keep working for every action they offered.
UPDATE "approval_tokens" AS t SET "actions" = '{"approve","skip","posted"}'
FROM "users" AS u WHERE u."id" = t."user_id" AND lower(u."email") = t."email";--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "processing_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "prefetch" jsonb;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "awaiting_input" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "notify_email" varchar(255);--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_reset_idx" ON "rate_limit_buckets" USING btree ("reset_at");--> statement-breakpoint
-- Close duplicate live jobs (keep the newest per repo) so the unique index can be built.
UPDATE "generation_jobs" SET "status" = 'failed', "error_message" = 'Superseded by a newer run', "updated_at" = now()
WHERE "status" NOT IN ('completed', 'partial_completed', 'failed', 'cancelled')
  AND "id" NOT IN (
    SELECT DISTINCT ON ("repo_id") "id" FROM "generation_jobs"
    WHERE "status" NOT IN ('completed', 'partial_completed', 'failed', 'cancelled')
    ORDER BY "repo_id", "created_at" DESC
  );--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_active_repo_uidx" ON "generation_jobs" USING btree ("repo_id") WHERE status NOT IN ('completed', 'partial_completed', 'failed', 'cancelled');