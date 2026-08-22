ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "start_date" timestamp;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "end_date" timestamp;

CREATE INDEX IF NOT EXISTS "team_task_items_schedule_idx" ON "team_task_items" ("team_id", "start_date", "end_date");