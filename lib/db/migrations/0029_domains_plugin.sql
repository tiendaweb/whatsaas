CREATE TABLE IF NOT EXISTS "team_domains" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "registrar" varchar(100),
  "expires_at" timestamp,
  "registered_at" timestamp,
  "auto_renew" boolean NOT NULL DEFAULT false,
  "status" varchar(30) NOT NULL DEFAULT 'active',
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "notes" text NOT NULL DEFAULT '',
  "price" integer,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "tags" jsonb NOT NULL DEFAULT '[]',
  "notify_days_before" integer NOT NULL DEFAULT 30,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "team_domains_team_idx" ON "team_domains" ("team_id");
CREATE INDEX IF NOT EXISTS "team_domains_expires_idx" ON "team_domains" ("team_id", "expires_at");
