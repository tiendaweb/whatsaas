CREATE TABLE IF NOT EXISTS "message_audio_insights" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "chat_id" integer NOT NULL,
  "message_id" text NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "transcript" text DEFAULT '' NOT NULL,
  "language" varchar(16) DEFAULT '' NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "intent" varchar(48) DEFAULT '' NOT NULL,
  "urgency" varchar(16) DEFAULT '' NOT NULL,
  "sentiment" varchar(16) DEFAULT '' NOT NULL,
  "entities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "duration_seconds" integer DEFAULT 0 NOT NULL,
  "provider" varchar(40) DEFAULT '' NOT NULL,
  "model" varchar(80) DEFAULT '' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "error" text DEFAULT '' NOT NULL,
  "generated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_audio_insights" ADD CONSTRAINT "message_audio_insights_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_audio_insights" ADD CONSTRAINT "message_audio_insights_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_audio_insights" ADD CONSTRAINT "message_audio_insights_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_audio_insights_message_uidx" ON "message_audio_insights" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_audio_insights_team_status_idx" ON "message_audio_insights" USING btree ("team_id", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_audio_insights_chat_idx" ON "message_audio_insights" USING btree ("chat_id", "generated_at");
