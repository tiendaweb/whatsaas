CREATE TABLE IF NOT EXISTS "team_desktop_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "layout" jsonb DEFAULT '{"version":1,"order":[],"pinned":[],"hidden":[]}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_desktop_preferences_team_user_uidx" UNIQUE("team_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "team_desktop_preferences_user_idx"
  ON "team_desktop_preferences" ("user_id");
