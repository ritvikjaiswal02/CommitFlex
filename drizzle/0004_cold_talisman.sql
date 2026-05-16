ALTER TABLE "generation_jobs" ADD COLUMN "source_type" varchar(20) DEFAULT 'window' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "source_ref" text;