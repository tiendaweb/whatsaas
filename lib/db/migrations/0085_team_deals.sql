CREATE TABLE IF NOT EXISTS "team_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"customer_id" integer,
	"contact_id" integer,
	"stage" varchar(30) DEFAULT 'qualified' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"probability" smallint DEFAULT 50 NOT NULL,
	"expected_close_date" timestamp,
	"closed_at" timestamp,
	"lost_reason" text DEFAULT '' NOT NULL,
	"owner_id" integer,
	"sale_id" integer,
	"source" varchar(40) DEFAULT 'manual' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_deals" ADD CONSTRAINT "team_deals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_deals" ADD CONSTRAINT "team_deals_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "team_customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_deals" ADD CONSTRAINT "team_deals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_deals" ADD CONSTRAINT "team_deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_deals" ADD CONSTRAINT "team_deals_sale_id_team_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "team_sales"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_deals" ADD CONSTRAINT "team_deals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_deals" ADD CONSTRAINT "team_deals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_deals_team_idx" ON "team_deals" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_deals_stage_idx" ON "team_deals" ("team_id","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_deals_customer_idx" ON "team_deals" ("team_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_deals_contact_idx" ON "team_deals" ("team_id","contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_deals_owner_idx" ON "team_deals" ("team_id","owner_id");
