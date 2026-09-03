ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "ai_prompt" text DEFAULT '' NOT NULL;
