-- Add color + icon to workspaces, projects, columns (etapas)
-- Add cover photo support (via media id) to tasks

ALTER TABLE "team_task_workspaces" ADD COLUMN IF NOT EXISTS "color" varchar(20);
ALTER TABLE "team_task_workspaces" ADD COLUMN IF NOT EXISTS "icon" varchar(60);

ALTER TABLE "team_task_projects" ADD COLUMN IF NOT EXISTS "color" varchar(20);
ALTER TABLE "team_task_projects" ADD COLUMN IF NOT EXISTS "icon" varchar(60);

ALTER TABLE "team_task_columns" ADD COLUMN IF NOT EXISTS "color" varchar(20);
ALTER TABLE "team_task_columns" ADD COLUMN IF NOT EXISTS "icon" varchar(60);

ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "cover_media_id" integer;

-- Optional: index for cover lookups (not required but useful)
CREATE INDEX IF NOT EXISTS "team_task_items_cover_idx" ON "team_task_items" ("cover_media_id");