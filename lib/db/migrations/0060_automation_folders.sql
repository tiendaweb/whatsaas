CREATE TABLE IF NOT EXISTS "automation_folders" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "parent_id" integer,
  "name" varchar(120) NOT NULL,
  "color" varchar(20) DEFAULT '#8B9D83' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_folders" ADD CONSTRAINT "automation_folders_team_id_teams_id_fk"
 FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_folders" ADD CONSTRAINT "automation_folders_parent_id_automation_folders_id_fk"
 FOREIGN KEY ("parent_id") REFERENCES "public"."automation_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "folder_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automations" ADD CONSTRAINT "automations_folder_id_automation_folders_id_fk"
 FOREIGN KEY ("folder_id") REFERENCES "public"."automation_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_folders_team_parent_position_idx"
  ON "automation_folders" USING btree ("team_id", "parent_id", "position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automations_team_folder_idx"
  ON "automations" USING btree ("team_id", "folder_id");
