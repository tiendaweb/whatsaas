CREATE TABLE IF NOT EXISTS "marketplace_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" varchar(255) NOT NULL,
  "subtitle" varchar(255),
  "icon_url" text,
  "description" text DEFAULT '' NOT NULL,
  "category" varchar(100) DEFAULT 'general' NOT NULL,
  "tag" varchar(100),
  "is_free" boolean DEFAULT false NOT NULL,
  "monthly_price" numeric(10, 2),
  "annual_price" numeric(10, 2),
  "installation_price" numeric(10, 2),
  "currency" varchar(3) DEFAULT 'usd' NOT NULL,
  "interface_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "marketplace_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "marketplace_item_id" integer NOT NULL,
  "requested_by" integer NOT NULL,
  "status" varchar(30) DEFAULT 'pending' NOT NULL,
  "pricing_type" varchar(20) DEFAULT 'free' NOT NULL,
  "amount" numeric(10, 2),
  "notes" text,
  "admin_notes" text,
  "reviewed_by" integer,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_orders_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE,
  CONSTRAINT "marketplace_orders_item_id_fk" FOREIGN KEY ("marketplace_item_id") REFERENCES "marketplace_items"("id") ON DELETE CASCADE,
  CONSTRAINT "marketplace_orders_requested_by_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "marketplace_orders_reviewed_by_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_items_category_idx" ON "marketplace_items" ("category");
CREATE INDEX IF NOT EXISTS "marketplace_items_active_idx" ON "marketplace_items" ("is_active");
CREATE INDEX IF NOT EXISTS "marketplace_orders_team_idx" ON "marketplace_orders" ("team_id");
CREATE INDEX IF NOT EXISTS "marketplace_orders_status_idx" ON "marketplace_orders" ("status");
CREATE INDEX IF NOT EXISTS "marketplace_orders_item_idx" ON "marketplace_orders" ("marketplace_item_id");
