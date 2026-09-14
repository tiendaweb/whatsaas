-- Financiación de servicios y proyectos por cuotas. Los importes siguen en la
-- unidad mínima de la moneda, pero BIGINT evita desbordes válidos en PYG.
ALTER TABLE "team_sales" ALTER COLUMN "subtotal" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_sales" ALTER COLUMN "discount_amount" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_sales" ALTER COLUMN "tax_amount" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_sales" ALTER COLUMN "total" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_membership_plans" ALTER COLUMN "price" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_membership_plans" ALTER COLUMN "setup_fee" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_membership_plans" ALTER COLUMN "maintenance_amount" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ALTER COLUMN "price" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ALTER COLUMN "amount" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_financial_accounts" ALTER COLUMN "opening_balance" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_budgets" ALTER COLUMN "amount" TYPE bigint;
--> statement-breakpoint
ALTER TABLE "team_financial_entry_payments" ALTER COLUMN "amount" TYPE bigint;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_financing_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "title" varchar(200) NOT NULL,
  "customer_id" integer REFERENCES "team_customers"("id") ON DELETE set null,
  "sale_id" integer REFERENCES "team_sales"("id") ON DELETE set null,
  "project_id" integer REFERENCES "team_task_projects"("id") ON DELETE set null,
  "total_amount" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "frequency" varchar(16) NOT NULL,
  "installment_count" integer NOT NULL,
  "first_due_on" date NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_financing_plans_amount_check" CHECK ("total_amount" > 0),
  CONSTRAINT "team_financing_plans_count_check" CHECK ("installment_count" BETWEEN 1 AND 260),
  CONSTRAINT "team_financing_plans_currency_check" CHECK ("currency" IN ('ARS', 'USD', 'PYG')),
  CONSTRAINT "team_financing_plans_frequency_check" CHECK ("frequency" IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT "team_financing_plans_status_check" CHECK ("status" IN ('active', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financing_plans_team_status_idx" ON "team_financing_plans" ("team_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financing_plans_customer_idx" ON "team_financing_plans" ("team_id", "customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financing_plans_sale_idx" ON "team_financing_plans" ("team_id", "sale_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financing_plans_project_idx" ON "team_financing_plans" ("team_id", "project_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_financing_installments" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "plan_id" integer NOT NULL REFERENCES "team_financing_plans"("id") ON DELETE cascade,
  "entry_id" integer NOT NULL REFERENCES "team_financial_entries"("id") ON DELETE restrict,
  "installment_number" integer NOT NULL,
  "due_on" date NOT NULL,
  "amount" bigint NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_financing_installments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "team_financing_installments_number_check" CHECK ("installment_number" > 0),
  CONSTRAINT "team_financing_installments_plan_number_uidx" UNIQUE ("plan_id", "installment_number"),
  CONSTRAINT "team_financing_installments_entry_uidx" UNIQUE ("entry_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financing_installments_team_due_idx" ON "team_financing_installments" ("team_id", "due_on");
