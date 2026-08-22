CREATE TABLE IF NOT EXISTS "mini_app_installs" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "app_slug" varchar(100) NOT NULL,
  "installed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "installed_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mini_app_installs_unique" UNIQUE("team_id","app_slug")
);
CREATE TABLE IF NOT EXISTS "mini_app_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "app_slug" varchar(100) NOT NULL,
  "collection" varchar(100) NOT NULL,
  "record_id" varchar(100) NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "mini_app_records_unique" UNIQUE("team_id","app_slug","collection","record_id")
);
CREATE INDEX IF NOT EXISTS "mini_app_installs_team_idx" ON "mini_app_installs"("team_id");
CREATE INDEX IF NOT EXISTS "mini_app_records_lookup_idx" ON "mini_app_records"("team_id","app_slug","collection");
