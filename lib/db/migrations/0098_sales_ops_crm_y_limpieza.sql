-- Command Center: chats ignorados, sugerencias de IA por cliente y prompt del
-- mensaje programado.
--
-- 1) `team_chat_exclusions`. Hasta hoy los chats internos se listaban en dos
--    variables de entorno (`CHATS_INTERNOS_JIDS` / `_NOMBRES`): para sacar del
--    radar el chat de la familia había que editar el `.env` y desplegar, así
--    que en la práctica nadie lo hacía y esos chats seguían gastando cuota de
--    IA, apareciendo en el embudo y llenando la cola de audios. Ahora se marcan
--    desde la vista Limpieza, con el motivo (personal / equipo / otros), y el
--    radar, el clasificador y la cola de audios los ignoran todos por igual.
--
-- 2) `ai_suggestions` en el análisis: las "siguientes acciones" que la IA
--    propone para ESE cliente. Antes la ficha mostraba tres botones iguales
--    para todos; la recomendación real depende del chat.
--
-- 3) `ai_prompt` en el programado: el prompt guardado con el que se reescribe
--    ese mensaje. Sin esto había que volver a explicarle a la IA qué tono y qué
--    datos usar cada vez que se corregía el texto.

CREATE TABLE IF NOT EXISTS "team_chat_exclusions" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "chat_id" integer NOT NULL REFERENCES "chats"("id") ON DELETE CASCADE,
  -- personal | equipo | otros
  "kind" varchar(12) NOT NULL DEFAULT 'otros',
  "reason" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_chat_exclusions_chat_idx" ON "team_chat_exclusions" ("team_id","chat_id");
CREATE INDEX IF NOT EXISTS "team_chat_exclusions_kind_idx" ON "team_chat_exclusions" ("team_id","kind");

ALTER TABLE "team_commercial_analysis" ADD COLUMN IF NOT EXISTS "ai_suggestions" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "team_commercial_analysis" ADD COLUMN IF NOT EXISTS "ai_suggestions_at" timestamp;

ALTER TABLE "team_scheduled_messages" ADD COLUMN IF NOT EXISTS "ai_prompt" text;
