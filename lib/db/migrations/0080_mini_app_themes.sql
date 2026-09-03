CREATE TABLE IF NOT EXISTS "team_mini_app_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"app_slug" varchar(100) NOT NULL,
	"mode" varchar(20) DEFAULT 'default' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_version" integer,
	"published_definition" jsonb,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_mini_app_themes_team_app_uidx" UNIQUE("team_id","app_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_mini_app_theme_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" integer NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"summary" varchar(300),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_mini_app_theme_versions_theme_version_uidx" UNIQUE("theme_id","version")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_mini_app_themes" ADD CONSTRAINT "team_mini_app_themes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_mini_app_themes" ADD CONSTRAINT "team_mini_app_themes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_mini_app_themes" ADD CONSTRAINT "team_mini_app_themes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_mini_app_theme_versions" ADD CONSTRAINT "team_mini_app_theme_versions_theme_id_team_mini_app_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."team_mini_app_themes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_mini_app_theme_versions" ADD CONSTRAINT "team_mini_app_theme_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_mini_app_themes_team_idx" ON "team_mini_app_themes" USING btree ("team_id");
