CREATE TABLE IF NOT EXISTS "team_radar_widgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"key" varchar(80) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"icon" varchar(40),
	"tone" varchar(20),
	"section" varchar(32) DEFAULT 'resumen' NOT NULL,
	"surface" varchar(16) DEFAULT 'dashboard' NOT NULL,
	"size" varchar(8) DEFAULT 'md' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"contact_id" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"source" varchar(12) DEFAULT 'ai' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_radar_widgets_team_key_uidx" UNIQUE("team_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_radar_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"category" varchar(24) DEFAULT 'generales' NOT NULL,
	"contact_id" integer,
	"assigned_user_id" integer,
	"summary" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_radar_reports_document_uidx" UNIQUE("document_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_widgets" ADD CONSTRAINT "team_radar_widgets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_widgets" ADD CONSTRAINT "team_radar_widgets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_widgets" ADD CONSTRAINT "team_radar_widgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_widgets" ADD CONSTRAINT "team_radar_widgets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_reports" ADD CONSTRAINT "team_radar_reports_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_reports" ADD CONSTRAINT "team_radar_reports_document_id_team_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."team_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_reports" ADD CONSTRAINT "team_radar_reports_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_reports" ADD CONSTRAINT "team_radar_reports_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_reports" ADD CONSTRAINT "team_radar_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_widgets_team_section_idx" ON "team_radar_widgets" USING btree ("team_id","section");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_widgets_contact_idx" ON "team_radar_widgets" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_reports_team_category_idx" ON "team_radar_reports" USING btree ("team_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_reports_contact_idx" ON "team_radar_reports" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_reports_assigned_idx" ON "team_radar_reports" USING btree ("assigned_user_id");
