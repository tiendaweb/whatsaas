CREATE TABLE IF NOT EXISTS "plugin_system_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "plugin_id" varchar(80) NOT NULL,
  "enabled_by_default" boolean DEFAULT false NOT NULL,
  "updated_by" integer,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "plugin_system_states_plugin_id_unique" UNIQUE("plugin_id")
);
--> statement-breakpoint
ALTER TABLE "plugin_system_states" ADD CONSTRAINT "plugin_system_states_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plugin_system_states_enabled_idx" ON "plugin_system_states" USING btree ("enabled_by_default");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_member_plugins" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "plugin_id" varchar(80) NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_by" integer,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_member_plugins_team_user_plugin_idx" UNIQUE("team_id", "user_id", "plugin_id")
);
--> statement-breakpoint
ALTER TABLE "team_member_plugins" ADD CONSTRAINT "team_member_plugins_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_member_plugins" ADD CONSTRAINT "team_member_plugins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_member_plugins" ADD CONSTRAINT "team_member_plugins_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_member_plugins_team_user_idx" ON "team_member_plugins" USING btree ("team_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_member_plugins_team_plugin_idx" ON "team_member_plugins" USING btree ("team_id", "plugin_id");
