CREATE TABLE IF NOT EXISTS "team_app_maker_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "app_id" integer NOT NULL,
  "entity_key" varchar(48) NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_app_maker_records_scope_id_uidx" UNIQUE("team_id", "app_id", "id")
);

CREATE TABLE IF NOT EXISTS "team_app_maker_record_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "app_id" integer NOT NULL,
  "relation_key" varchar(48) NOT NULL,
  "source_record_id" integer NOT NULL,
  "target_kind" varchar(16) NOT NULL,
  "target_key" varchar(80) NOT NULL,
  "target_record_id" varchar(160) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_app_maker_record_links_edge_uidx" UNIQUE("app_id", "relation_key", "source_record_id", "target_kind", "target_key", "target_record_id")
);

CREATE TABLE IF NOT EXISTS "team_app_maker_attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "app_id" integer NOT NULL,
  "record_id" integer NOT NULL,
  "field_key" varchar(48) NOT NULL,
  "file_name" varchar(240) NOT NULL,
  "mime_type" varchar(160) NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_path" text NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "team_app_maker_records" ADD CONSTRAINT "team_app_maker_records_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_records" ADD CONSTRAINT "team_app_maker_records_app_id_team_radar_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."team_radar_apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_records" ADD CONSTRAINT "team_app_maker_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_records" ADD CONSTRAINT "team_app_maker_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "team_app_maker_record_links" ADD CONSTRAINT "team_app_maker_record_links_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_record_links" ADD CONSTRAINT "team_app_maker_record_links_app_id_team_radar_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."team_radar_apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_record_links" ADD CONSTRAINT "team_app_maker_record_links_source_record_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."team_app_maker_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_record_links" ADD CONSTRAINT "team_app_maker_record_links_source_scope_fk" FOREIGN KEY ("team_id", "app_id", "source_record_id") REFERENCES "public"."team_app_maker_records"("team_id", "app_id", "id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_record_links" ADD CONSTRAINT "team_app_maker_record_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "team_app_maker_attachments" ADD CONSTRAINT "team_app_maker_attachments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_attachments" ADD CONSTRAINT "team_app_maker_attachments_app_id_team_radar_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."team_radar_apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_attachments" ADD CONSTRAINT "team_app_maker_attachments_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."team_app_maker_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_attachments" ADD CONSTRAINT "team_app_maker_attachments_record_scope_fk" FOREIGN KEY ("team_id", "app_id", "record_id") REFERENCES "public"."team_app_maker_records"("team_id", "app_id", "id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "team_app_maker_attachments" ADD CONSTRAINT "team_app_maker_attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "team_app_maker_records_app_entity_idx" ON "team_app_maker_records" USING btree ("team_id", "app_id", "entity_key");
CREATE INDEX IF NOT EXISTS "team_app_maker_record_links_source_idx" ON "team_app_maker_record_links" USING btree ("team_id", "app_id", "source_record_id");
CREATE INDEX IF NOT EXISTS "team_app_maker_record_links_target_idx" ON "team_app_maker_record_links" USING btree ("team_id", "target_kind", "target_key", "target_record_id");
CREATE INDEX IF NOT EXISTS "team_app_maker_attachments_record_idx" ON "team_app_maker_attachments" USING btree ("team_id", "app_id", "record_id");
