CREATE TABLE IF NOT EXISTS "team_sites" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "slug" varchar(63) NOT NULL,
  "subdomain" varchar(63),
  "published" boolean DEFAULT true NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_sites_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "team_sites_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "team_sites_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_sites_team_idx" ON "team_sites" USING btree ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_sites_slug_uidx" ON "team_sites" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_sites_subdomain_uidx"
  ON "team_sites" USING btree ("subdomain") WHERE "team_sites"."subdomain" is not null;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_site_files" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "site_id" integer NOT NULL,
  "path" varchar(800) NOT NULL,
  "kind" varchar(12) DEFAULT 'file' NOT NULL,
  "mime_type" varchar(160),
  "encoding" varchar(12) DEFAULT 'utf8' NOT NULL,
  "content" text,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_site_files_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "team_site_files_site_id_team_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "public"."team_sites"("id") ON DELETE cascade,
  CONSTRAINT "team_site_files_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "team_site_files_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "team_site_files_site_path_uidx" UNIQUE("site_id", "path")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_site_files_team_site_idx"
  ON "team_site_files" USING btree ("team_id", "site_id");
