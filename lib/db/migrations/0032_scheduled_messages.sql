CREATE TABLE IF NOT EXISTS "team_scheduled_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "instance_id" integer REFERENCES "evolution_instances"("id") ON DELETE SET NULL,
  "target_numbers" jsonb NOT NULL DEFAULT '[]',
  "schedule_type" varchar(20) NOT NULL DEFAULT 'once',
  "scheduled_at" timestamp,
  "hour" integer,
  "minute" integer,
  "weekdays" jsonb NOT NULL DEFAULT '[]',
  "action_type" varchar(20) NOT NULL DEFAULT 'message',
  "message" text,
  "media_url" text,
  "automation_id" integer REFERENCES "automations"("id") ON DELETE SET NULL,
  "last_run_at" timestamp,
  "next_run_at" timestamp,
  "run_count" integer NOT NULL DEFAULT 0,
  "max_runs" integer,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "scheduled_messages_team_idx" ON "team_scheduled_messages"("team_id");
CREATE INDEX IF NOT EXISTS "scheduled_messages_next_run_idx" ON "team_scheduled_messages"("next_run_at", "status");
