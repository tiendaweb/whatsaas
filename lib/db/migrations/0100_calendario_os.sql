-- Calendario OS: eventos con más forma (día completo, lugar, recurrencia, color,
-- recordatorios, id externo para Google) y la base del sistema de notificaciones.

ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "all_day" boolean DEFAULT false NOT NULL;
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "location" varchar(300);
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "color" varchar(20);
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "recurrence" varchar(20) DEFAULT 'none' NOT NULL;
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "recurrence_until" date;
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "reminder_minutes" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "external_source" varchar(40);
ALTER TABLE "team_events" ADD COLUMN IF NOT EXISTS "external_id" varchar(255);

CREATE INDEX IF NOT EXISTS "team_events_range_idx" ON "team_events" ("team_id","starts_at","ends_at");

-- Notificaciones: la tabla existía como bandeja simple; ahora es la cola de todo
-- el sistema (in-app, push y WhatsApp), con envío programado y estado.
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'pending' NOT NULL;
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "channels" jsonb DEFAULT '["inapp"]'::jsonb NOT NULL;
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "url" varchar(400);
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "source" varchar(24) DEFAULT 'system' NOT NULL;
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "group_jid" varchar(64);
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "team_notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" varchar(160);

CREATE INDEX IF NOT EXISTS "team_notifications_pending_idx" ON "team_notifications" ("status","scheduled_for");
CREATE UNIQUE INDEX IF NOT EXISTS "team_notifications_dedupe_idx" ON "team_notifications" ("team_id","dedupe_key") WHERE "dedupe_key" IS NOT NULL;

-- A qué canal y a qué número le llega a cada persona.
CREATE TABLE IF NOT EXISTS "team_notification_prefs" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "whatsapp_phone" varchar(40),
  "whatsapp_enabled" boolean DEFAULT false NOT NULL,
  "push_enabled" boolean DEFAULT true NOT NULL,
  "inapp_enabled" boolean DEFAULT true NOT NULL,
  "quiet_from" smallint,
  "quiet_to" smallint,
  "kinds" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "group_jid" varchar(64),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_notification_prefs_team_user_uidx" UNIQUE("team_id","user_id")
);

-- Suscripciones de push del navegador (una por dispositivo).
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" varchar(300),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_used_at" timestamp,
  CONSTRAINT "push_subscriptions_endpoint_uidx" UNIQUE("endpoint")
);
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" ("team_id","user_id");
