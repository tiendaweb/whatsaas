-- Fase 3 Business OS: Soporte/Postventa (tickets + comentarios) + Contratos.
--
-- Versión pragmática, no el diseño completo de docs/business-platform/40-clientes-soporte.md
-- (que agrega categorías, políticas SLA versionadas, bitácora de eventos, feedback CSAT/NPS,
-- health score y casos de renovación). Igual que en Fases 1-2, se reutiliza team_customers,
-- contacts y chats existentes y solo se crean las tablas sin equivalente real.
-- Guards IF NOT EXISTS por el desajuste conocido drizzle-kit vs BD real
-- (ver memoria project_drizzle_journal_desync).

CREATE TABLE IF NOT EXISTS "team_support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"customer_id" integer,
	"contact_id" integer,
	"chat_id" integer,
	"category" varchar(60),
	"priority" varchar(10) DEFAULT 'normal' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"subject" varchar(300) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"assigned_user_id" integer,
	"due_at" timestamp,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_support_tickets_customer_or_contact_check" CHECK ("customer_id" IS NOT NULL OR "contact_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_support_ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_user_id" integer,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"customer_id" integer,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'ARS' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"start_date" date,
	"end_date" date,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"document_id" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_support_tickets" ADD CONSTRAINT "team_support_tickets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_tickets" ADD CONSTRAINT "team_support_tickets_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_tickets" ADD CONSTRAINT "team_support_tickets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_tickets" ADD CONSTRAINT "team_support_tickets_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_tickets" ADD CONSTRAINT "team_support_tickets_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_tickets" ADD CONSTRAINT "team_support_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_tickets" ADD CONSTRAINT "team_support_tickets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_ticket_comments" ADD CONSTRAINT "team_support_ticket_comments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_ticket_comments" ADD CONSTRAINT "team_support_ticket_comments_ticket_id_team_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."team_support_tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_support_ticket_comments" ADD CONSTRAINT "team_support_ticket_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_contracts" ADD CONSTRAINT "team_contracts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_contracts" ADD CONSTRAINT "team_contracts_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_contracts" ADD CONSTRAINT "team_contracts_document_id_team_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."team_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_contracts" ADD CONSTRAINT "team_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_contracts" ADD CONSTRAINT "team_contracts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_support_tickets_team_status_idx" ON "team_support_tickets" USING btree ("team_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_support_tickets_team_assigned_idx" ON "team_support_tickets" USING btree ("team_id","assigned_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_support_tickets_customer_idx" ON "team_support_tickets" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_support_tickets_contact_idx" ON "team_support_tickets" USING btree ("contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_support_ticket_comments_ticket_idx" ON "team_support_ticket_comments" USING btree ("ticket_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_contracts_team_status_idx" ON "team_contracts" USING btree ("team_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_contracts_customer_idx" ON "team_contracts" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_contracts_team_end_date_idx" ON "team_contracts" USING btree ("team_id","end_date");
