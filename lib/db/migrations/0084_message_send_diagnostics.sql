ALTER TABLE "team_scheduled_messages" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_message_send_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" integer,
	"source" varchar(30) DEFAULT 'mcp' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_message_send_keys_team_key_idx" UNIQUE("team_id","key_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_message_send_keys" ADD CONSTRAINT "team_message_send_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_message_send_keys" ADD CONSTRAINT "team_message_send_keys_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
