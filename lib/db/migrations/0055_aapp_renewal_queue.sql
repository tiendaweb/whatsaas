ALTER TABLE "team_customer_stores" ADD COLUMN IF NOT EXISTS "whatsapp_phone" varchar(80);
ALTER TABLE "team_customer_stores" ADD COLUMN IF NOT EXISTS "whatsapp_phone_resolved_at" timestamp;

CREATE TABLE IF NOT EXISTS "team_aapp_renewal_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL UNIQUE REFERENCES "teams"("id") ON DELETE cascade,
  "enabled" boolean DEFAULT false NOT NULL,
  "instance_id" integer REFERENCES "evolution_instances"("id") ON DELETE set null,
  "recipient_source" varchar(20) DEFAULT 'account' NOT NULL,
  "send_hour" integer DEFAULT 9 NOT NULL,
  "send_minute" integer DEFAULT 0 NOT NULL,
  "timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
  "templates" jsonb NOT NULL,
  "enabled_rule_keys" jsonb DEFAULT '["before_30","before_14","before_3","expired"]'::jsonb NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "team_aapp_renewal_configs_team_idx" ON "team_aapp_renewal_configs" ("team_id");

CREATE TABLE IF NOT EXISTS "team_aapp_renewal_candidates" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "subscription_id" integer NOT NULL REFERENCES "team_membership_subscriptions"("id") ON DELETE cascade,
  "customer_id" integer REFERENCES "team_customers"("id") ON DELETE set null,
  "rule_key" varchar(20) NOT NULL,
  "expiration_date" date NOT NULL,
  "due_date" date NOT NULL,
  "send_at" timestamp,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "requested_recipient_source" varchar(20) NOT NULL,
  "resolved_recipient_source" varchar(20),
  "recipient_phone" varchar(80),
  "recipient_store_id" integer REFERENCES "team_customer_stores"("id") ON DELETE set null,
  "used_account_fallback" boolean DEFAULT false NOT NULL,
  "message" text NOT NULL,
  "instance_id" integer REFERENCES "evolution_instances"("id") ON DELETE set null,
  "approved_by" integer REFERENCES "users"("id") ON DELETE set null,
  "approved_at" timestamp,
  "rejected_by" integer REFERENCES "users"("id") ON DELETE set null,
  "rejected_at" timestamp,
  "sent_at" timestamp,
  "message_id" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_aapp_renewal_candidates_subscription_rule_expiry_uidx" UNIQUE("team_id","subscription_id","rule_key","expiration_date")
);
CREATE INDEX IF NOT EXISTS "team_aapp_renewal_candidates_queue_idx" ON "team_aapp_renewal_candidates" ("team_id","status","send_at");
CREATE INDEX IF NOT EXISTS "team_aapp_renewal_candidates_subscription_idx" ON "team_aapp_renewal_candidates" ("subscription_id");
