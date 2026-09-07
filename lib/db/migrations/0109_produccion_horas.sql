-- Producción OS: lo que el Protocolo Maestro pide medir y no existía.
--
-- Los tres documentos operativos (Catálogo v1.2, Protocolo SPACE, Protocolo
-- BUSINESS) giran alrededor de US$ por hora y de la línea roja «más de 6 horas
-- con ticket menor a US$ 250». El pedido no guardaba ni horas ni ticket, así que
-- el KPI central no se podía calcular. Sobre la tarea: ticket, estimado, rondas,
-- estado del pago, ficha de handoff y de qué ítem del catálogo nació. Las horas
-- REALES van en una tabla aparte, por sesión: la primera pregunta del protocolo
-- es cuántos bloques se fueron en retrabajo, y eso necesita fechas.
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "ticket_amount" integer;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "ticket_currency" varchar(3);
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "estimated_minutes" integer;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "revision_rounds_included" smallint;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "revision_rounds_used" smallint NOT NULL DEFAULT 0;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "payment_state" varchar(24);
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "handoff" jsonb;
ALTER TABLE "team_task_items" ADD COLUMN IF NOT EXISTS "catalog_key" varchar(48);

CREATE TABLE IF NOT EXISTS "team_task_work_sessions" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "task_id" integer NOT NULL REFERENCES "team_task_items"("id") ON DELETE CASCADE,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" timestamp NOT NULL,
  "ended_at" timestamp,
  "minutes" integer,
  "kind" varchar(16) NOT NULL DEFAULT 'foco',
  "source" varchar(16) NOT NULL DEFAULT 'bloque',
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_task_work_sessions_task_idx" ON "team_task_work_sessions" ("team_id", "task_id");
CREATE INDEX IF NOT EXISTS "team_task_work_sessions_open_idx" ON "team_task_work_sessions" ("team_id", "user_id", "ended_at");

-- Lo vendido que ya está entregado o en curso nació antes de la regla de pago:
-- se marca «verificado» para no bloquear retroactivamente lo que ya se cobró y
-- se hizo. Lo que sigue en «pedido» queda sin estado de pago a propósito: es
-- exactamente lo que el protocolo dice que hay que revisar antes de aceptar.
UPDATE "team_task_items"
   SET "payment_state" = 'verificado'
 WHERE "work_kind" IN ('sitio_html','tienda_custom','tienda_aapp','sitio_aapp','prosite','desarrollo')
   AND "work_status" IN ('en_curso','qa','espera_cliente','entregado','activado','cambios')
   AND "payment_state" IS NULL;

-- Rondas incluidas según el catálogo: 1 express (productos AAPP SPACE), 2 premium.
UPDATE "team_task_items" SET "revision_rounds_included" = 1 WHERE "work_kind" IN ('sitio_aapp','tienda_aapp') AND "revision_rounds_included" IS NULL;
UPDATE "team_task_items" SET "revision_rounds_included" = 2 WHERE "work_kind" IN ('sitio_html','tienda_custom','prosite','desarrollo') AND "revision_rounds_included" IS NULL;
