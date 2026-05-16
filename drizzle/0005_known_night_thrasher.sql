ALTER TABLE "voice_settings" DROP CONSTRAINT "voice_settings_userId_unique";--> statement-breakpoint
ALTER TABLE "voice_settings" ADD COLUMN "name" varchar(60) DEFAULT 'Default' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD COLUMN "is_default" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "voice_profiles_user_idx" ON "voice_settings" USING btree ("userId");