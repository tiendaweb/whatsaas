CREATE TABLE IF NOT EXISTS "team_gemini_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "label" varchar(80) NOT NULL,
  "api_key" text NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "model" varchar(80) DEFAULT 'gemini-2.5-flash' NOT NULL,
  "limit_rpm" integer DEFAULT 10 NOT NULL,
  "limit_rpd" integer DEFAULT 250 NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "last_used_at" timestamp with time zone,
  "last_error" text DEFAULT '' NOT NULL,
  "last_error_at" timestamp with time zone,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_gemini_key_usage" (
  "id" serial PRIMARY KEY NOT NULL,
  "key_id" integer NOT NULL,
  "day" date NOT NULL,
  "requests" integer DEFAULT 0 NOT NULL,
  "errors" integer DEFAULT 0 NOT NULL,
  "quota_errors" integer DEFAULT 0 NOT NULL,
  "audio_seconds" integer DEFAULT 0 NOT NULL,
  "minute_window" timestamp with time zone,
  "minute_requests" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_gemini_keys" ADD CONSTRAINT "team_gemini_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_gemini_keys" ADD CONSTRAINT "team_gemini_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_gemini_key_usage" ADD CONSTRAINT "team_gemini_key_usage_key_id_team_gemini_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."team_gemini_keys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_gemini_keys_team_label_uidx" ON "team_gemini_keys" USING btree ("team_id", "label");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_gemini_keys_team_status_idx" ON "team_gemini_keys" USING btree ("team_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_gemini_key_usage_key_day_uidx" ON "team_gemini_key_usage" USING btree ("key_id", "day");
--> statement-breakpoint
ALTER TABLE "message_audio_insights" ADD COLUMN IF NOT EXISTS "queued_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "message_audio_insights" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "message_audio_insights" ADD COLUMN IF NOT EXISTS "requested_by" varchar(24) DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "message_audio_insights" ADD COLUMN IF NOT EXISTS "key_id" integer;
--> statement-breakpoint
ALTER TABLE "message_audio_insights" ADD COLUMN IF NOT EXISTS "analyzed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_audio_insights_queue_idx" ON "message_audio_insights" USING btree ("status", "priority", "queued_at");
