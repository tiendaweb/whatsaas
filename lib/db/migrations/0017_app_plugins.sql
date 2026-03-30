CREATE TABLE "team_plugins" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"plugin_id" varchar(80) NOT NULL,
	"installed" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"installed_by" integer,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_plugins_team_id_plugin_id_idx" UNIQUE("team_id","plugin_id")
);
--> statement-breakpoint
ALTER TABLE "team_plugins" ADD CONSTRAINT "team_plugins_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_plugins" ADD CONSTRAINT "team_plugins_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "team_plugins_team_enabled_idx" ON "team_plugins" USING btree ("team_id","enabled");
