ALTER TABLE "team_task_workspaces"
  ADD COLUMN IF NOT EXISTS "embed_token" varchar(64),
  ADD COLUMN IF NOT EXISTS "embed_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "embed_access" varchar(16) NOT NULL DEFAULT 'manage';

ALTER TABLE "team_task_projects"
  ADD COLUMN IF NOT EXISTS "embed_token" varchar(64),
  ADD COLUMN IF NOT EXISTS "embed_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "embed_access" varchar(16) NOT NULL DEFAULT 'manage';

CREATE UNIQUE INDEX IF NOT EXISTS "team_task_workspaces_embed_token_uidx" ON "team_task_workspaces"("embed_token");
CREATE UNIQUE INDEX IF NOT EXISTS "team_task_projects_embed_token_uidx" ON "team_task_projects"("embed_token");
