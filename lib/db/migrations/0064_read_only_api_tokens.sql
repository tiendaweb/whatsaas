CREATE TABLE IF NOT EXISTS "read_only_api_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "created_by" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "token_prefix" varchar(16) NOT NULL,
  "token_last_four" varchar(4) NOT NULL,
  "scopes" jsonb DEFAULT '["read:*"]'::jsonb NOT NULL,
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "read_only_api_tokens_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "read_only_api_tokens_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "read_only_api_tokens_team_created_idx"
  ON "read_only_api_tokens" ("team_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "read_only_api_tokens_active_idx"
  ON "read_only_api_tokens" ("team_id", "revoked_at", "expires_at");
