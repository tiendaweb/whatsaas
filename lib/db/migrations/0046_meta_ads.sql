-- App CAMPAÑAS: Meta Marketing API (Ads).
-- Guardamos el histórico propio porque Meta retiene sólo 13 meses.

CREATE TABLE IF NOT EXISTS "meta_ads_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "label" varchar(120) NOT NULL,
  "token" text NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "last_error" text,
  "last_validated_at" timestamp,
  "connected_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meta_ads_tokens_team_label_uidx" UNIQUE ("team_id", "label")
);
CREATE INDEX IF NOT EXISTS "meta_ads_tokens_team_idx" ON "meta_ads_tokens" ("team_id");

CREATE TABLE IF NOT EXISTS "meta_ad_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "token_id" integer NOT NULL REFERENCES "meta_ads_tokens"("id") ON DELETE cascade,
  "account_id" varchar(40) NOT NULL,
  "name" text NOT NULL,
  "currency" varchar(10) DEFAULT 'USD' NOT NULL,
  "timezone_name" varchar(64),
  "account_status" integer,
  "business_id" varchar(40),
  "business_name" text,
  "amount_spent" numeric(16, 2) DEFAULT 0 NOT NULL,
  "sync_enabled" boolean DEFAULT true NOT NULL,
  "last_synced_at" timestamp,
  "last_sync_status" varchar(20),
  "last_error" text,
  "campaigns_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meta_ad_accounts_team_account_uidx" UNIQUE ("team_id", "account_id")
);
CREATE INDEX IF NOT EXISTS "meta_ad_accounts_team_idx" ON "meta_ad_accounts" ("team_id");
CREATE INDEX IF NOT EXISTS "meta_ad_accounts_sync_idx" ON "meta_ad_accounts" ("sync_enabled", "last_synced_at");

CREATE TABLE IF NOT EXISTS "meta_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "ad_account_id" integer NOT NULL REFERENCES "meta_ad_accounts"("id") ON DELETE cascade,
  "campaign_id" varchar(40) NOT NULL,
  "name" text NOT NULL,
  "status" varchar(20),
  "effective_status" varchar(40),
  "objective" varchar(50),
  "result_action_type" varchar(80),
  "buying_type" varchar(20),
  "daily_budget" numeric(14, 2),
  "lifetime_budget" numeric(14, 2),
  "created_time" timestamp,
  "start_time" timestamp,
  "stop_time" timestamp,
  "updated_time" timestamp,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meta_campaigns_account_campaign_uidx" UNIQUE ("ad_account_id", "campaign_id")
);
CREATE INDEX IF NOT EXISTS "meta_campaigns_team_idx" ON "meta_campaigns" ("team_id");
CREATE INDEX IF NOT EXISTS "meta_campaigns_account_status_idx" ON "meta_campaigns" ("ad_account_id", "status");

-- spend en moneda de la cuenta (NO centavos). reach se guarda pero NO es sumable entre días.
CREATE TABLE IF NOT EXISTS "meta_campaign_insights_daily" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "ad_account_id" integer NOT NULL REFERENCES "meta_ad_accounts"("id") ON DELETE cascade,
  "campaign_row_id" integer NOT NULL REFERENCES "meta_campaigns"("id") ON DELETE cascade,
  "campaign_id" varchar(40) NOT NULL,
  "date" date NOT NULL,
  "spend" numeric(14, 2) DEFAULT 0 NOT NULL,
  "impressions" bigint DEFAULT 0 NOT NULL,
  "reach" bigint DEFAULT 0 NOT NULL,
  "clicks" bigint DEFAULT 0 NOT NULL,
  "inline_link_clicks" bigint DEFAULT 0 NOT NULL,
  "frequency" numeric(8, 4),
  "results" numeric(14, 2) DEFAULT 0 NOT NULL,
  "result_action_type" varchar(80),
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cost_per_action_type" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "currency" varchar(10),
  "synced_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "meta_insights_campaign_date_uidx" UNIQUE ("campaign_row_id", "date")
);
CREATE INDEX IF NOT EXISTS "meta_insights_account_date_idx" ON "meta_campaign_insights_daily" ("ad_account_id", "date");
CREATE INDEX IF NOT EXISTS "meta_insights_team_date_idx" ON "meta_campaign_insights_daily" ("team_id", "date");

CREATE TABLE IF NOT EXISTS "meta_ads_sync_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "ad_account_id" integer NOT NULL REFERENCES "meta_ad_accounts"("id") ON DELETE cascade,
  "trigger" varchar(10) NOT NULL,
  "status" varchar(20) NOT NULL,
  "since" date,
  "until" date,
  "campaigns_upserted" integer DEFAULT 0 NOT NULL,
  "insights_upserted" integer DEFAULT 0 NOT NULL,
  "error" text,
  "started_by" integer REFERENCES "users"("id") ON DELETE set null,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp
);
CREATE INDEX IF NOT EXISTS "meta_ads_sync_runs_account_idx" ON "meta_ads_sync_runs" ("ad_account_id", "started_at");
