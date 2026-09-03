CREATE TABLE IF NOT EXISTS "team_radar_apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"icon" varchar(60),
	"tone" varchar(20),
	"owner_user_id" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_version" integer,
	"published_definition" jsonb,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_radar_apps_team_slug_uidx" UNIQUE("team_id","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_radar_app_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"summary" varchar(300),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_radar_app_versions_app_version_uidx" UNIQUE("app_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_radar_user_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"app_slug" varchar(80) DEFAULT '' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_radar_user_state_team_user_app_uidx" UNIQUE("team_id","user_id","app_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_radar_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"app_slug" varchar(80),
	"contact_id" integer,
	"title" varchar(200) NOT NULL,
	"description" text,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"confidence" integer,
	"source" varchar(80),
	"evidence" jsonb,
	"recommended_action" text,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"expires_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_apps" ADD CONSTRAINT "team_radar_apps_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_apps" ADD CONSTRAINT "team_radar_apps_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_apps" ADD CONSTRAINT "team_radar_apps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_apps" ADD CONSTRAINT "team_radar_apps_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_app_versions" ADD CONSTRAINT "team_radar_app_versions_app_id_team_radar_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."team_radar_apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_app_versions" ADD CONSTRAINT "team_radar_app_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_user_state" ADD CONSTRAINT "team_radar_user_state_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_user_state" ADD CONSTRAINT "team_radar_user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_insights" ADD CONSTRAINT "team_radar_insights_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_insights" ADD CONSTRAINT "team_radar_insights_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_radar_insights" ADD CONSTRAINT "team_radar_insights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_apps_team_idx" ON "team_radar_apps" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_insights_team_status_idx" ON "team_radar_insights" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_radar_insights_team_contact_idx" ON "team_radar_insights" USING btree ("team_id","contact_id");
