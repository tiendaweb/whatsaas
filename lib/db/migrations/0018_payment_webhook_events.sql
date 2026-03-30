CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" varchar(50) NOT NULL,
  "topic" varchar(80) NOT NULL,
  "event_id" varchar(191),
  "payment_id" varchar(191),
  "status" varchar(20) DEFAULT 'processing' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "processed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_event_id_uidx"
  ON "payment_webhook_events" ("provider", "event_id")
  WHERE "event_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_payment_id_uidx"
  ON "payment_webhook_events" ("provider", "payment_id")
  WHERE "payment_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_webhook_events_provider_status_idx"
  ON "payment_webhook_events" ("provider", "status");
