-- Fase 2 Business OS: Proveedores/Compras (vendors, purchase orders, purchase
-- order items) + RRHH/Comisiones (perfiles laborales, reglas de comisión,
-- comisiones por venta).
--
-- Sigue el mismo patrón pragmático de 0068_business_os_phase1.sql: tablas
-- nuevas solo donde no existe equivalente, reutilizando team_articles,
-- team_sales, team_financial_entries, users, teams y departments. Guards
-- IF NOT EXISTS para que sea re-ejecutable de forma segura ante el desajuste
-- conocido entre el snapshot de drizzle-kit y la BD real (ver memoria
-- project_drizzle_journal_desync).

CREATE TABLE IF NOT EXISTS "team_vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"tax_id" varchar(60),
	"email" varchar(200),
	"phone" varchar(40),
	"address" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"order_number" varchar(40) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'ARS' NOT NULL,
	"subtotal_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"expected_date" date,
	"received_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"finance_entry_id" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_purchase_orders_team_number_uidx" UNIQUE("team_id","order_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"article_id" integer,
	"description" varchar(300) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_employee_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"job_title" varchar(160),
	"employment_status" varchar(20) DEFAULT 'active' NOT NULL,
	"hire_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_employee_profiles_team_user_uidx" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_commission_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"rate_bps" integer NOT NULL,
	"applies_to" varchar(20) DEFAULT 'all_sales' NOT NULL,
	"article_id" integer,
	"user_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_commission_rules_rate_bps_check" CHECK ("rate_bps" >= 0 AND "rate_bps" <= 10000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_sale_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"sale_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rule_id" integer,
	"basis_amount" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'ARS' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"finance_entry_id" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_sale_commissions_team_sale_user_uidx" UNIQUE("team_id","sale_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "team_vendors" ADD CONSTRAINT "team_vendors_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_vendors" ADD CONSTRAINT "team_vendors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_vendors" ADD CONSTRAINT "team_vendors_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_orders" ADD CONSTRAINT "team_purchase_orders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_orders" ADD CONSTRAINT "team_purchase_orders_vendor_id_team_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."team_vendors"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_orders" ADD CONSTRAINT "team_purchase_orders_finance_entry_id_team_financial_entries_id_fk" FOREIGN KEY ("finance_entry_id") REFERENCES "public"."team_financial_entries"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_orders" ADD CONSTRAINT "team_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_orders" ADD CONSTRAINT "team_purchase_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_order_items" ADD CONSTRAINT "team_purchase_order_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_order_items" ADD CONSTRAINT "team_purchase_order_items_purchase_order_id_team_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."team_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_purchase_order_items" ADD CONSTRAINT "team_purchase_order_items_article_id_team_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."team_articles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_employee_profiles" ADD CONSTRAINT "team_employee_profiles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_employee_profiles" ADD CONSTRAINT "team_employee_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_employee_profiles" ADD CONSTRAINT "team_employee_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_employee_profiles" ADD CONSTRAINT "team_employee_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_commission_rules" ADD CONSTRAINT "team_commission_rules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_commission_rules" ADD CONSTRAINT "team_commission_rules_article_id_team_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."team_articles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_commission_rules" ADD CONSTRAINT "team_commission_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_commission_rules" ADD CONSTRAINT "team_commission_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_sale_commissions" ADD CONSTRAINT "team_sale_commissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_sale_commissions" ADD CONSTRAINT "team_sale_commissions_sale_id_team_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."team_sales"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_sale_commissions" ADD CONSTRAINT "team_sale_commissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_sale_commissions" ADD CONSTRAINT "team_sale_commissions_rule_id_team_commission_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."team_commission_rules"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_sale_commissions" ADD CONSTRAINT "team_sale_commissions_finance_entry_id_team_financial_entries_id_fk" FOREIGN KEY ("finance_entry_id") REFERENCES "public"."team_financial_entries"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_sale_commissions" ADD CONSTRAINT "team_sale_commissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_vendors_team_active_idx" ON "team_vendors" USING btree ("team_id","is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_purchase_orders_team_status_idx" ON "team_purchase_orders" USING btree ("team_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_purchase_orders_vendor_idx" ON "team_purchase_orders" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_purchase_order_items_po_idx" ON "team_purchase_order_items" USING btree ("purchase_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_employee_profiles_team_status_idx" ON "team_employee_profiles" USING btree ("team_id","employment_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_commission_rules_team_active_idx" ON "team_commission_rules" USING btree ("team_id","is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_sale_commissions_team_status_idx" ON "team_sale_commissions" USING btree ("team_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_sale_commissions_user_idx" ON "team_sale_commissions" USING btree ("team_id","user_id");
