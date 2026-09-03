ALTER TABLE "team_task_workspaces" ADD COLUMN IF NOT EXISTS "ai_prompt" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_task_projects" ADD COLUMN IF NOT EXISTS "ai_prompt" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "ai_next_step" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "ai_context_question" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "ai_context_answer" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "ai_ready_at" timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_operations_ai_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "role" varchar(16) NOT NULL,
  "content" text NOT NULL,
  "source" varchar(40) DEFAULT 'ui' NOT NULL,
  "surface" varchar(32) DEFAULT 'general' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_task_ai_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "target_type" varchar(16) NOT NULL,
  "target_id" integer NOT NULL,
  "phase" varchar(16) NOT NULL,
  "status" varchar(16) NOT NULL,
  "prompt_fingerprint" varchar(64) NOT NULL,
  "prompt_snapshot" text NOT NULL,
  "summary" text NOT NULL,
  "connector" varchar(40) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_operations_ai_messages" ADD CONSTRAINT "team_operations_ai_messages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_operations_ai_messages" ADD CONSTRAINT "team_operations_ai_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_task_ai_runs" ADD CONSTRAINT "team_task_ai_runs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_task_ai_runs" ADD CONSTRAINT "team_task_ai_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_operations_ai_messages_team_created_idx" ON "team_operations_ai_messages" USING btree ("team_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_task_ai_runs_target_idx" ON "team_task_ai_runs" USING btree ("team_id", "target_type", "target_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_task_ai_runs_fingerprint_idx" ON "team_task_ai_runs" USING btree ("team_id", "prompt_fingerprint", "phase");
