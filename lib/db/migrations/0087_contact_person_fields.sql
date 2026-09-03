ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email" varchar(255);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phone" varchar(80);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "company" varchar(200);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "job_title" varchar(120);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "department" varchar(120);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "linkedin_url" varchar(255);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "lead_score" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "temperature" varchar(10) DEFAULT 'warm' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "is_vip" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_temperature_idx" ON "contacts" ("team_id","temperature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_lead_score_idx" ON "contacts" ("team_id","lead_score");--> statement-breakpoint
-- Backfill 1: lo que ya estaba en custom_data. COALESCE nunca pisa un valor
-- existente. Las claves de custom_data son configurables por equipo, así que
-- esto sólo rescata las convencionales; el resto se migra a mano si hace falta.
UPDATE "contacts"
   SET "email" = COALESCE("email", NULLIF(TRIM("custom_data"->>'email'), '')),
       "phone" = COALESCE("phone", NULLIF(TRIM("custom_data"->>'phone'), ''))
 WHERE "custom_data" ? 'email' OR "custom_data" ? 'phone';--> statement-breakpoint
-- Backfill 2: el teléfono NO vive en custom_data sino en el JID del chat, que es
-- de donde lo saca `convertContactToCustomer`. Sin esto la columna queda vacía
-- para todos los contactos de WhatsApp, que son casi todos.
-- Se excluyen los JID de grupo: ahí el número no identifica a una persona.
UPDATE "contacts" c
   SET "phone" = NULLIF(regexp_replace(split_part(ch."remote_jid", '@', 1), '[^0-9]', '', 'g'), '')
  FROM "chats" ch
 WHERE ch."id" = c."chat_id"
   AND ch."remote_jid" NOT LIKE '%@g.us'
   AND c."phone" IS NULL;
