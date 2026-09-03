CREATE TABLE IF NOT EXISTS "team_command_suggestions" (
        "id" serial PRIMARY KEY NOT NULL,
        "team_id" integer NOT NULL,
        "item_key" text NOT NULL,
        "fingerprint" text NOT NULL,
        "status" varchar(12) DEFAULT 'pending' NOT NULL,
        "suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "provider" varchar(40),
        "model" varchar(80),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "expires_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_command_suggestions" ADD CONSTRAINT "team_command_suggestions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_command_suggestions_item_idx" ON "team_command_suggestions" ("team_id","item_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_command_suggestions_expires_idx" ON "team_command_suggestions" ("expires_at");
