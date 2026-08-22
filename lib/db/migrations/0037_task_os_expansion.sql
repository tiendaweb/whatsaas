ALTER TABLE "team_task_items"
  ADD COLUMN IF NOT EXISTS "status" varchar(30) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "parent_task_id" integer;

CREATE INDEX IF NOT EXISTS "team_task_items_project_idx" ON "team_task_items"("project_id");
CREATE INDEX IF NOT EXISTS "team_task_items_parent_idx" ON "team_task_items"("parent_task_id");
CREATE INDEX IF NOT EXISTS "team_task_items_status_idx" ON "team_task_items"("team_id", "status");

CREATE TABLE IF NOT EXISTS "team_task_item_locations" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "team_task_items"("id") ON DELETE cascade,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "project_id" integer NOT NULL REFERENCES "team_task_projects"("id") ON DELETE cascade,
  "column_id" integer NOT NULL REFERENCES "team_task_columns"("id") ON DELETE cascade,
  "order" integer NOT NULL DEFAULT 0,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_task_item_locations_task_project_uidx"
  ON "team_task_item_locations"("task_id", "project_id");
CREATE INDEX IF NOT EXISTS "team_task_item_locations_task_idx"
  ON "team_task_item_locations"("task_id");
CREATE INDEX IF NOT EXISTS "team_task_item_locations_project_column_idx"
  ON "team_task_item_locations"("project_id", "column_id");

INSERT INTO "team_task_item_locations" ("task_id", "team_id", "project_id", "column_id", "order", "is_primary")
SELECT "id", "team_id", "project_id", "column_id", "order", true
FROM "team_task_items"
ON CONFLICT ("task_id", "project_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "team_task_relations" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "source_type" varchar(30) NOT NULL,
  "source_id" integer NOT NULL,
  "target_type" varchar(30) NOT NULL,
  "target_id" integer NOT NULL,
  "relation_type" varchar(40) NOT NULL DEFAULT 'related',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_task_relations_uidx"
  ON "team_task_relations"("team_id", "source_type", "source_id", "target_type", "target_id", "relation_type");
CREATE INDEX IF NOT EXISTS "team_task_relations_source_idx"
  ON "team_task_relations"("team_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "team_task_relations_target_idx"
  ON "team_task_relations"("team_id", "target_type", "target_id");

CREATE TABLE IF NOT EXISTS "team_task_dependencies" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "task_id" integer NOT NULL REFERENCES "team_task_items"("id") ON DELETE cascade,
  "depends_on_task_id" integer NOT NULL REFERENCES "team_task_items"("id") ON DELETE cascade,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_task_dependencies_uidx"
  ON "team_task_dependencies"("task_id", "depends_on_task_id");
CREATE INDEX IF NOT EXISTS "team_task_dependencies_task_idx"
  ON "team_task_dependencies"("team_id", "task_id");

CREATE TABLE IF NOT EXISTS "team_task_media" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "owner_type" varchar(30) NOT NULL,
  "owner_id" integer NOT NULL,
  "url" text NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(180),
  "size" integer,
  "source" varchar(30) NOT NULL DEFAULT 'upload',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "team_task_media_owner_idx"
  ON "team_task_media"("team_id", "owner_type", "owner_id");
CREATE INDEX IF NOT EXISTS "team_task_media_url_idx"
  ON "team_task_media"("team_id", "url");

CREATE TABLE IF NOT EXISTS "team_task_templates" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "type" varchar(30) NOT NULL,
  "name" varchar(200) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "team_task_templates_team_type_idx"
  ON "team_task_templates"("team_id", "type");
