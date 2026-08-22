CREATE TABLE IF NOT EXISTS "hostinger_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "label" varchar(120) NOT NULL,
  "token" text NOT NULL,
  "status" varchar(20) DEFAULT 'connected' NOT NULL,
  "last_error" text,
  "last_synced_at" timestamp,
  "domains_count" integer DEFAULT 0 NOT NULL,
  "connected_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "hostinger_accounts_team_idx" ON "hostinger_accounts" ("team_id");

DO $$ BEGIN
  ALTER TABLE "hostinger_accounts" ADD CONSTRAINT "hostinger_accounts_team_label_uidx" UNIQUE ("team_id", "label");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "team_domains" ADD COLUMN IF NOT EXISTS "source" varchar(30) DEFAULT 'manual' NOT NULL;
ALTER TABLE "team_domains" ADD COLUMN IF NOT EXISTS "external_id" varchar(160);
ALTER TABLE "team_domains" ADD COLUMN IF NOT EXISTS "hostinger_account_id" integer REFERENCES "hostinger_accounts"("id") ON DELETE set null;
ALTER TABLE "team_domains" ADD COLUMN IF NOT EXISTS "customer_id" integer REFERENCES "team_customers"("id") ON DELETE set null;

-- Permite reimportar sin duplicar: un dominio externo es único por equipo y origen.
CREATE UNIQUE INDEX IF NOT EXISTS "team_domains_team_source_external_uidx"
  ON "team_domains" ("team_id", "source", "external_id")
  WHERE "external_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "team_domains_customer_idx" ON "team_domains" ("customer_id");
