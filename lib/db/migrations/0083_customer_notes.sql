CREATE TABLE IF NOT EXISTS "team_customer_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"text" text NOT NULL,
	"kind" varchar(20) DEFAULT 'note' NOT NULL,
	"source" varchar(20) DEFAULT 'user' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_customer_notes" ADD CONSTRAINT "team_customer_notes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_customer_notes" ADD CONSTRAINT "team_customer_notes_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."team_customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_customer_notes" ADD CONSTRAINT "team_customer_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_customer_notes_customer_idx" ON "team_customer_notes" USING btree ("team_id","customer_id");
