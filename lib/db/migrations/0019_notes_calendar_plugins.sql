CREATE TABLE IF NOT EXISTS "team_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "title" varchar(180) NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "status" varchar(30) DEFAULT 'todo' NOT NULL,
  "due_date" timestamp,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "team_notes_team_status_idx" ON "team_notes" ("team_id", "status");
CREATE INDEX IF NOT EXISTS "team_notes_team_due_idx" ON "team_notes" ("team_id", "due_date");

CREATE TABLE IF NOT EXISTS "team_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "title" varchar(180) NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "reminder_at" timestamp with time zone,
  "status" varchar(30) DEFAULT 'scheduled' NOT NULL,
  "department_id" integer REFERENCES "departments"("id") ON DELETE set null,
  "related_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE set null,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "team_events_team_start_idx" ON "team_events" ("team_id", "starts_at");
CREATE INDEX IF NOT EXISTS "team_events_team_status_idx" ON "team_events" ("team_id", "status");

CREATE TABLE IF NOT EXISTS "team_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
  "type" varchar(50) NOT NULL,
  "title" varchar(180) NOT NULL,
  "body" text NOT NULL,
  "entity_type" varchar(50),
  "entity_id" integer,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "team_notifications_team_unread_idx" ON "team_notifications" ("team_id", "read_at");
