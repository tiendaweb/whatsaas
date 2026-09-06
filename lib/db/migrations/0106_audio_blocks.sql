-- Bloques de trabajo de la cola de audios (Command Center › Audios).
--
-- La cola de Gemini se drenaba en un solo orden y sin freno: 660 audios, de
-- los cuales 273 eran de clientes ya cerrados (G11), competían por la misma
-- cuota que el clasificador y que lo que una persona pide a mano. Un bloque
-- agrupa audios (por frente comercial, por contacto, por lo que sea) y decide
-- si se transcriben ahora, a partir de un día, con un tope diario, o nunca
-- hasta que alguien lo reactive.
CREATE TABLE IF NOT EXISTS "team_audio_blocks" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  -- active | paused
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "position" integer NOT NULL DEFAULT 0,
  -- El bloque no se drena antes de este día.
  "not_before" date,
  -- Audios por día como máximo para este bloque (NULL = sin tope).
  "daily_cap" integer,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_audio_blocks_team_idx" ON "team_audio_blocks" ("team_id", "position");

ALTER TABLE "message_audio_insights" ADD COLUMN IF NOT EXISTS "block_id" integer REFERENCES "team_audio_blocks"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "message_audio_insights_block_idx" ON "message_audio_insights" ("block_id", "status");
