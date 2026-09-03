CREATE TABLE IF NOT EXISTS "team_document_portals" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_document_portals_team_uidx" UNIQUE("team_id")
);

DO $$ BEGIN
 ALTER TABLE "team_document_portals" ADD CONSTRAINT "team_document_portals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "team_document_portals" ADD CONSTRAINT "team_document_portals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "team_document_portals" ADD CONSTRAINT "team_document_portals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
