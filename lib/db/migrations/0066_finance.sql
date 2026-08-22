CREATE TABLE IF NOT EXISTS "team_financial_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "type" varchar(12) NOT NULL,
  "title" varchar(200) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "category" varchar(60) NOT NULL,
  "amount" integer NOT NULL,
  "currency" varchar(3) DEFAULT 'ARS' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "occurred_on" date NOT NULL,
  "due_on" date,
  "paid_on" date,
  "recurrence" varchar(20) DEFAULT 'none' NOT NULL,
  "recurrence_end_on" date,
  "next_due_on" date,
  "payment_method" varchar(80),
  "counterparty" varchar(200),
  "customer_id" integer,
  "company_id" integer,
  "plan_id" integer,
  "subscription_id" integer,
  "external_source" varchar(60),
  "external_id" varchar(160),
  "external_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_financial_entries_type_check" CHECK ("type" IN ('income', 'expense')),
  CONSTRAINT "team_financial_entries_status_check" CHECK ("status" IN ('pending', 'paid', 'overdue', 'cancelled')),
  CONSTRAINT "team_financial_entries_recurrence_check" CHECK ("recurrence" IN ('none', 'monthly', 'annual')),
  CONSTRAINT "team_financial_entries_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "team_financial_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "team_financial_entries_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE set null,
  CONSTRAINT "team_financial_entries_company_id_team_membership_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."team_membership_companies"("id") ON DELETE set null,
  CONSTRAINT "team_financial_entries_plan_id_team_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."team_membership_plans"("id") ON DELETE set null,
  CONSTRAINT "team_financial_entries_subscription_id_team_membership_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."team_membership_subscriptions"("id") ON DELETE set null,
  CONSTRAINT "team_financial_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "team_financial_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_team_type_date_idx" ON "team_financial_entries" ("team_id", "type", "occurred_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_team_status_due_idx" ON "team_financial_entries" ("team_id", "status", "due_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_customer_idx" ON "team_financial_entries" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_entries_subscription_idx" ON "team_financial_entries" ("subscription_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_financial_entries_team_external_uidx" ON "team_financial_entries" ("team_id", "external_source", "external_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_financial_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "entry_id" integer,
  "message_id" text,
  "chat_id" integer,
  "media_url" text NOT NULL,
  "mime_type" varchar(160),
  "file_name" varchar(255),
  "document_date" date,
  "payment_date" date,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_financial_receipts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "team_financial_receipts_entry_id_team_financial_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."team_financial_entries"("id") ON DELETE set null,
  CONSTRAINT "team_financial_receipts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null,
  CONSTRAINT "team_financial_receipts_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null,
  CONSTRAINT "team_financial_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_receipts_team_created_idx" ON "team_financial_receipts" ("team_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_financial_receipts_entry_idx" ON "team_financial_receipts" ("entry_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_financial_receipts_team_message_uidx" ON "team_financial_receipts" ("team_id", "message_id");
