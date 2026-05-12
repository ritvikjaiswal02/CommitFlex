CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"job_id" uuid,
	"kind" varchar(50) NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"delivery_status" varchar(30) DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"userId" text PRIMARY KEY NOT NULL,
	"email_on_complete" boolean DEFAULT true NOT NULL,
	"weekly_digest" boolean DEFAULT false NOT NULL,
	"product_updates" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_user_kind_idx" ON "email_log" USING btree ("userId","kind");--> statement-breakpoint
CREATE INDEX "email_log_job_kind_idx" ON "email_log" USING btree ("job_id","kind");