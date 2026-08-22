CREATE TABLE IF NOT EXISTS "team_articles" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "sku" varchar(100),
  "price" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "category" varchar(100),
  "unit" varchar(50) NOT NULL DEFAULT 'unidad',
  "stock" integer,
  "image_url" text,
  "tags" jsonb NOT NULL DEFAULT '[]',
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "team_articles_team_idx" ON "team_articles" ("team_id");
CREATE INDEX IF NOT EXISTS "team_articles_sku_idx" ON "team_articles" ("team_id", "sku");

CREATE TABLE IF NOT EXISTS "team_sales" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "sale_number" varchar(50) NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "items" jsonb NOT NULL DEFAULT '[]',
  "subtotal" integer NOT NULL DEFAULT 0,
  "discount_amount" integer NOT NULL DEFAULT 0,
  "tax_amount" integer NOT NULL DEFAULT 0,
  "total" integer NOT NULL DEFAULT 0,
  "notes" text NOT NULL DEFAULT '',
  "paid_at" timestamp,
  "due_date" timestamp,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "team_sales_team_idx" ON "team_sales" ("team_id");
CREATE INDEX IF NOT EXISTS "team_sales_contact_idx" ON "team_sales" ("team_id", "contact_id");
CREATE INDEX IF NOT EXISTS "team_sales_status_idx" ON "team_sales" ("team_id", "status");
