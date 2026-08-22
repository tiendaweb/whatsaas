CREATE TABLE "team_aapp_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"api_key" text NOT NULL,
	"status" varchar(20) DEFAULT 'disconnected' NOT NULL,
	"company_id" integer,
	"last_synced_at" timestamp,
	"last_sync_status" varchar(20),
	"last_sync_error" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_aapp_connections_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
CREATE TABLE "team_customer_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_customer_contacts_customer_contact_uidx" UNIQUE("customer_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "team_customer_stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"customer_id" integer,
	"external_id" varchar(160) NOT NULL,
	"card_type" varchar(60),
	"title" varchar(255),
	"sub_title" varchar(255),
	"card_url" text,
	"custom_domain" text,
	"profile_image" text,
	"status" varchar(30),
	"external_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_customer_stores_team_external_uidx" UNIQUE("team_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "team_customer_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"customer_id" integer,
	"external_id" varchar(160) NOT NULL,
	"plan_external_id" varchar(160),
	"amount" varchar(80),
	"currency" varchar(10),
	"payment_status" varchar(40),
	"gateway" varchar(80),
	"transaction_date" timestamp,
	"external_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_customer_transactions_team_external_uidx" UNIQUE("team_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "team_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(255),
	"phone" varchar(80),
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"external_id" varchar(160),
	"external_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"profile_image" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_synced_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_customers_team_source_external_uidx" UNIQUE("team_id","source","external_id")
);
--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" DROP CONSTRAINT "team_membership_subscriptions_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD COLUMN "phone" varchar(80);--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD COLUMN "external_source" varchar(60);--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD COLUMN "external_id" varchar(160);--> statement-breakpoint
ALTER TABLE "team_membership_plans" ADD COLUMN "external_source" varchar(60);--> statement-breakpoint
ALTER TABLE "team_membership_plans" ADD COLUMN "external_id" varchar(160);--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD COLUMN "external_source" varchar(60);--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD COLUMN "external_id" varchar(160);--> statement-breakpoint
ALTER TABLE "team_aapp_connections" ADD CONSTRAINT "team_aapp_connections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_aapp_connections" ADD CONSTRAINT "team_aapp_connections_company_id_team_membership_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."team_membership_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_aapp_connections" ADD CONSTRAINT "team_aapp_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customer_contacts" ADD CONSTRAINT "team_customer_contacts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customer_contacts" ADD CONSTRAINT "team_customer_contacts_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customer_contacts" ADD CONSTRAINT "team_customer_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customer_stores" ADD CONSTRAINT "team_customer_stores_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customer_stores" ADD CONSTRAINT "team_customer_stores_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customer_transactions" ADD CONSTRAINT "team_customer_transactions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customer_transactions" ADD CONSTRAINT "team_customer_transactions_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customers" ADD CONSTRAINT "team_customers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customers" ADD CONSTRAINT "team_customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_customers" ADD CONSTRAINT "team_customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_aapp_connections_status_idx" ON "team_aapp_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "team_customer_contacts_team_idx" ON "team_customer_contacts" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_customer_stores_customer_idx" ON "team_customer_stores" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "team_customer_transactions_customer_idx" ON "team_customer_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "team_customers_team_idx" ON "team_customers" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_membership_subscriptions_customer_idx" ON "team_membership_subscriptions" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "team_membership_companies" ADD CONSTRAINT "team_membership_companies_team_external_uidx" UNIQUE("team_id","external_source","external_id");--> statement-breakpoint
ALTER TABLE "team_membership_plans" ADD CONSTRAINT "team_membership_plans_team_external_uidx" UNIQUE("team_id","external_source","external_id");--> statement-breakpoint
ALTER TABLE "team_membership_subscriptions" ADD CONSTRAINT "team_membership_subscriptions_team_external_uidx" UNIQUE("team_id","external_source","external_id");