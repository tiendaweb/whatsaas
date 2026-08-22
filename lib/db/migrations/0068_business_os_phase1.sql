-- Fase 1 Business OS: Finanzas (cuentas, centros de costo, presupuestos, pagos
-- parciales, tipo de cambio) + Reuniones/Llamadas (team_events) + Notas de
-- reunión (team_notes -> team_events).
--
-- NOTA: el diff automático de drizzle-kit incluyó de más varias tablas/columnas
-- (conversation_ai_summaries, grok_connector_*, read_only_api_tokens,
-- team_membership_plans.visibility, dashboard_bookmark_groups.funnel_stage_group_id,
-- y una recreación completa de team_financial_entries/team_financial_receipts)
-- porque el snapshot de drizzle-kit está desincronizado de la BD real (ver
-- memoria project_drizzle_journal_desync). Se removieron manualmente esos
-- statements porque esos objetos YA EXISTEN en producción; este archivo sólo
-- contiene los cambios genuinamente nuevos de esta fase, con guards
-- IF NOT EXISTS para que sea re-ejecutable de forma segura.

CREATE TABLE IF NOT EXISTS "team_financial_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(20) DEFAULT 'bank' NOT NULL,
	"currency" varchar(3) DEFAULT 'ARS' NOT NULL,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_cost_centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(30),
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_cost_centers_team_code_uidx" UNIQUE("team_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"cost_center_id" integer,
	"category" varchar(60),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'ARS' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_financial_entry_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	"account_id" integer,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"method" varchar(80),
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"quote_currency" varchar(3) NOT NULL,
	"rate" numeric(18, 6) NOT NULL,
	"rate_date" date NOT NULL,
	"source" varchar(60) DEFAULT 'manual' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_exchange_rates_team_pair_date_uidx" UNIQUE("team_id","base_currency","quote_currency","rate_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_event_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"user_id" integer,
	"contact_id" integer,
	"role" varchar(30) DEFAULT 'attendee' NOT NULL,
	"response_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_event_participants_event_user_uidx" UNIQUE("event_id","user_id"),
	CONSTRAINT "team_event_participants_event_contact_uidx" UNIQUE("event_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD COLUMN IF NOT EXISTS "sale_id" integer;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD COLUMN IF NOT EXISTS "account_id" integer;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD COLUMN IF NOT EXISTS "cost_center_id" integer;
--> statement-breakpoint
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "kind" varchar(20) DEFAULT 'meeting' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "subtype" varchar(40);
--> statement-breakpoint
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "outcome" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "next_action" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "customer_id" integer;
--> statement-breakpoint
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "related_event_id" integer;
--> statement-breakpoint
ALTER TABLE "team_notes" ADD COLUMN IF NOT EXISTS "event_id" integer;
--> statement-breakpoint
ALTER TABLE "team_notes" ADD COLUMN IF NOT EXISTS "commitments" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_financial_accounts" ADD CONSTRAINT "team_financial_accounts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_accounts" ADD CONSTRAINT "team_financial_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_accounts" ADD CONSTRAINT "team_financial_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_cost_centers" ADD CONSTRAINT "team_cost_centers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_budgets" ADD CONSTRAINT "team_budgets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_budgets" ADD CONSTRAINT "team_budgets_cost_center_id_team_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."team_cost_centers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_budgets" ADD CONSTRAINT "team_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entry_payments" ADD CONSTRAINT "team_financial_entry_payments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entry_payments" ADD CONSTRAINT "team_financial_entry_payments_entry_id_team_financial_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."team_financial_entries"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entry_payments" ADD CONSTRAINT "team_financial_entry_payments_account_id_team_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."team_financial_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entry_payments" ADD CONSTRAINT "team_financial_entry_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_exchange_rates" ADD CONSTRAINT "team_exchange_rates_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_exchange_rates" ADD CONSTRAINT "team_exchange_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_event_participants" ADD CONSTRAINT "team_event_participants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_event_participants" ADD CONSTRAINT "team_event_participants_event_id_team_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_event_participants" ADD CONSTRAINT "team_event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_event_participants" ADD CONSTRAINT "team_event_participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD CONSTRAINT "team_financial_entries_sale_id_team_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."team_sales"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD CONSTRAINT "team_financial_entries_project_id_team_task_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."team_task_projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD CONSTRAINT "team_financial_entries_account_id_team_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."team_financial_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_financial_entries" ADD CONSTRAINT "team_financial_entries_cost_center_id_team_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."team_cost_centers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_events" ADD CONSTRAINT "team_events_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_events" ADD CONSTRAINT "team_events_related_event_id_team_events_id_fk" FOREIGN KEY ("related_event_id") REFERENCES "public"."team_events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_notes" ADD CONSTRAINT "team_notes_event_id_team_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_accounts_team_active_idx" ON "team_financial_accounts" USING btree ("team_id","is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_cost_centers_team_active_idx" ON "team_cost_centers" USING btree ("team_id","is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_budgets_team_period_idx" ON "team_budgets" USING btree ("team_id","period_start","period_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_budgets_cost_center_idx" ON "team_budgets" USING btree ("cost_center_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entry_payments_entry_idx" ON "team_financial_entry_payments" USING btree ("entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entry_payments_team_paid_on_idx" ON "team_financial_entry_payments" USING btree ("team_id","paid_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_event_participants_event_idx" ON "team_event_participants" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_sale_idx" ON "team_financial_entries" USING btree ("sale_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_project_idx" ON "team_financial_entries" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_account_idx" ON "team_financial_entries" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_cost_center_idx" ON "team_financial_entries" USING btree ("cost_center_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_events_team_kind_idx" ON "team_events" USING btree ("team_id","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_events_customer_idx" ON "team_events" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_notes_event_idx" ON "team_notes" USING btree ("event_id");
