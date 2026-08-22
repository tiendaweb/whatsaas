CREATE TABLE IF NOT EXISTS "team_task_projects" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "background_url" text,
  "labels" jsonb NOT NULL DEFAULT '[]',
  "order" integer NOT NULL DEFAULT 0,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "team_task_columns" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "team_task_projects"("id") ON DELETE CASCADE,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "team_task_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "column_id" integer NOT NULL REFERENCES "team_task_columns"("id") ON DELETE CASCADE,
  "project_id" integer NOT NULL REFERENCES "team_task_projects"("id") ON DELETE CASCADE,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "title" varchar(500) NOT NULL,
  "notes" text NOT NULL DEFAULT '',
  "label_ids" jsonb NOT NULL DEFAULT '[]',
  "checklist" jsonb NOT NULL DEFAULT '[]',
  "order" integer NOT NULL DEFAULT 0,
  "due_date" timestamp,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "team_task_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "task_id" integer NOT NULL REFERENCES "team_task_items"("id") ON DELETE CASCADE,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "text" text NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "team_task_projects_team_idx" ON "team_task_projects"("team_id");
CREATE INDEX IF NOT EXISTS "team_task_columns_project_idx" ON "team_task_columns"("project_id");
CREATE INDEX IF NOT EXISTS "team_task_items_column_idx" ON "team_task_items"("column_id");
CREATE INDEX IF NOT EXISTS "team_task_items_due_idx" ON "team_task_items"("team_id", "due_date");
CREATE INDEX IF NOT EXISTS "team_task_comments_task_idx" ON "team_task_comments"("task_id");
