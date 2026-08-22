CREATE TABLE IF NOT EXISTS "team_task_workspaces" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "order" integer NOT NULL DEFAULT 0,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "team_task_workspaces_team_idx" ON "team_task_workspaces"("team_id");

ALTER TABLE "team_task_projects"
  ADD COLUMN IF NOT EXISTS "workspace_id" integer REFERENCES "team_task_workspaces"("id") ON DELETE SET NULL;

