ALTER TABLE "repos" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "webhook_id" bigint;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "auto_generate" boolean DEFAULT true NOT NULL;