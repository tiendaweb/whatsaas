CREATE TABLE IF NOT EXISTS "team_marketplace_entitlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "item_id" integer NOT NULL REFERENCES "marketplace_items"("id") ON DELETE restrict,
  "status" varchar(40) DEFAULT 'inactive' NOT NULL,
  "source_order_id" integer REFERENCES "marketplace_orders"("id") ON DELETE set null,
  "starts_at" timestamp DEFAULT now() NOT NULL,
  "ends_at" timestamp,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_marketplace_entitlements_team_item_uidx" UNIQUE("team_id", "item_id")
);

CREATE INDEX IF NOT EXISTS "team_marketplace_entitlements_team_status_idx" ON "team_marketplace_entitlements" ("team_id", "status");
CREATE INDEX IF NOT EXISTS "team_marketplace_entitlements_item_status_idx" ON "team_marketplace_entitlements" ("item_id", "status");
