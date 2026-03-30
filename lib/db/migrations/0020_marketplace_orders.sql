CREATE TABLE IF NOT EXISTS "marketplace_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" varchar(180) NOT NULL,
  "subtitle" varchar(255),
  "icon_url" text,
  "image_url" text,
  "description" text,
  "category" varchar(80) DEFAULT 'general' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "interface_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_items_category_status_idx" ON "marketplace_items" ("category", "status");

CREATE TABLE IF NOT EXISTS "marketplace_item_prices" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "marketplace_items"("id") ON DELETE cascade,
  "billing_type" varchar(20) NOT NULL,
  "amount" integer DEFAULT 0 NOT NULL,
  "currency" varchar(3) DEFAULT 'usd' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_item_prices_item_enabled_idx" ON "marketplace_item_prices" ("item_id", "enabled");

CREATE TABLE IF NOT EXISTS "marketplace_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "item_id" integer NOT NULL REFERENCES "marketplace_items"("id") ON DELETE restrict,
  "status" varchar(40) DEFAULT 'pending_review' NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "requested_by" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE set null,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_orders_team_status_idx" ON "marketplace_orders" ("team_id", "status");
CREATE INDEX IF NOT EXISTS "marketplace_orders_status_created_at_idx" ON "marketplace_orders" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "marketplace_order_lines" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "marketplace_orders"("id") ON DELETE cascade,
  "price_id" integer NOT NULL REFERENCES "marketplace_item_prices"("id") ON DELETE restrict,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_amount" integer NOT NULL,
  "currency" varchar(3) DEFAULT 'usd' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_order_lines_order_id_idx" ON "marketplace_order_lines" ("order_id");

CREATE TABLE IF NOT EXISTS "marketplace_order_status_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "marketplace_orders"("id") ON DELETE cascade,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "previous_status" varchar(40),
  "next_status" varchar(40) NOT NULL,
  "changed_by" integer REFERENCES "users"("id") ON DELETE set null,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_order_status_events_order_created_idx" ON "marketplace_order_status_events" ("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "marketplace_order_status_events_team_created_idx" ON "marketplace_order_status_events" ("team_id", "created_at");
