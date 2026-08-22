CREATE TABLE IF NOT EXISTS "conversation_ai_summaries" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "chat_id" integer NOT NULL,
  "summary" text NOT NULL,
  "message_count" integer DEFAULT 0 NOT NULL,
  "audio_message_count" integer DEFAULT 0 NOT NULL,
  "transcribed_audio_count" integer DEFAULT 0 NOT NULL,
  "last_message_at" timestamp with time zone,
  "generated_by" integer,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_ai_summaries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "conversation_ai_summaries_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade,
  CONSTRAINT "conversation_ai_summaries_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_ai_summaries_chat_uidx" ON "conversation_ai_summaries" ("chat_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_ai_summaries_team_updated_idx" ON "conversation_ai_summaries" ("team_id", "updated_at");
