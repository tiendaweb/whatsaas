CREATE TABLE IF NOT EXISTS "grok_connector_oauth_clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "client_id" varchar(160) NOT NULL UNIQUE,
  "client_name" varchar(160) DEFAULT 'Grok' NOT NULL,
  "redirect_uris" jsonb NOT NULL,
  "grant_types" jsonb DEFAULT '["authorization_code","refresh_token"]'::jsonb NOT NULL,
  "response_types" jsonb DEFAULT '["code"]'::jsonb NOT NULL,
  "token_endpoint_auth_method" varchar(40) DEFAULT 'none' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "grok_connector_oauth_clients_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "grok_connector_oauth_clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grok_connector_oauth_clients_team_user_idx" ON "grok_connector_oauth_clients" ("team_id", "user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grok_connector_credentials" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "client_id" varchar(160),
  "kind" varchar(32) NOT NULL,
  "secret_hash" varchar(64) NOT NULL UNIQUE,
  "scopes" jsonb DEFAULT '["whatspro:read"]'::jsonb NOT NULL,
  "redirect_uri" text,
  "code_challenge" varchar(160),
  "resource" text,
  "family_id" varchar(80),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "revoked_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "grok_connector_credentials_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade,
  CONSTRAINT "grok_connector_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grok_connector_credentials_active_secret_idx" ON "grok_connector_credentials" ("secret_hash", "kind", "revoked_at", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grok_connector_credentials_team_user_client_idx" ON "grok_connector_credentials" ("team_id", "user_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grok_connector_credentials_family_idx" ON "grok_connector_credentials" ("family_id");
