CREATE TABLE IF NOT EXISTS "dashboard_bookmark_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "color" varchar(20) DEFAULT '#2563EB' NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard_bookmark_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "group_id" integer NOT NULL,
  "entity_type" varchar(20) NOT NULL,
  "chat_id" integer,
  "project_id" integer,
  "order" integer DEFAULT 0 NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "dashboard_bookmark_items_entity_type_check"
    CHECK ("entity_type" IN ('chat', 'project')),
  CONSTRAINT "dashboard_bookmark_items_entity_reference_check"
    CHECK (
      ("entity_type" = 'chat' AND "chat_id" IS NOT NULL AND "project_id" IS NULL)
      OR
      ("entity_type" = 'project' AND "project_id" IS NOT NULL AND "chat_id" IS NULL)
    )
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_groups" ADD CONSTRAINT "dashboard_bookmark_groups_team_id_teams_id_fk"
 FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_groups" ADD CONSTRAINT "dashboard_bookmark_groups_created_by_users_id_fk"
 FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_items" ADD CONSTRAINT "dashboard_bookmark_items_team_id_teams_id_fk"
 FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_items" ADD CONSTRAINT "dashboard_bookmark_items_group_id_dashboard_bookmark_groups_id_fk"
 FOREIGN KEY ("group_id") REFERENCES "public"."dashboard_bookmark_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_items" ADD CONSTRAINT "dashboard_bookmark_items_chat_id_chats_id_fk"
 FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_items" ADD CONSTRAINT "dashboard_bookmark_items_project_id_team_task_projects_id_fk"
 FOREIGN KEY ("project_id") REFERENCES "public"."team_task_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_bookmark_items" ADD CONSTRAINT "dashboard_bookmark_items_created_by_users_id_fk"
 FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_bookmark_groups_team_idx"
  ON "dashboard_bookmark_groups" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_bookmark_groups_team_order_idx"
  ON "dashboard_bookmark_groups" USING btree ("team_id", "order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_bookmark_items_team_idx"
  ON "dashboard_bookmark_items" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_bookmark_items_group_order_idx"
  ON "dashboard_bookmark_items" USING btree ("group_id", "order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_bookmark_items_group_chat_uidx"
  ON "dashboard_bookmark_items" USING btree ("group_id", "chat_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_bookmark_items_group_project_uidx"
  ON "dashboard_bookmark_items" USING btree ("group_id", "project_id");
