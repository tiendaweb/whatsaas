-- Prompt Studio v2 — "Skills" del Command Center Comercial.
--
-- `team_prompts` guardaba título + texto y nada más: no había forma de saber si
-- una acción era para correrla todos los días o una sola vez, si la ejecuta el
-- servidor con la API del equipo o un conector desde la cola, ni qué datos hay
-- que completar antes de usarla. Todo eso vivía en la cabeza de quien la
-- escribió, así que un conector no podía elegir ni completar nada solo.
--
-- Estas columnas son ese contrato: categoría e ícono para la vista, `recurrence`
-- para separar rutinas de acciones puntuales, `execution` para decidir API vs
-- cola, `variables` con el formulario de datos dinámicos y `recommend_for` con
-- los gates donde la skill aparece como siguiente acción en la ficha del chat.

ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL DEFAULT 'general';
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "icon" varchar(24) NOT NULL DEFAULT 'sparkles';
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "recurrence" varchar(12) NOT NULL DEFAULT 'on_demand';
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "execution" varchar(12) NOT NULL DEFAULT 'connector';
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "scope" varchar(12) NOT NULL DEFAULT 'team';
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "variables" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "recommend_for" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "pinned" boolean NOT NULL DEFAULT false;
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "usage_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "team_prompts" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp;

CREATE INDEX IF NOT EXISTS "team_prompts_catalog_idx" ON "team_prompts" ("team_id","status","category");

-- Corridas: con qué datos se lanzó, quién la ejecuta y qué devolvió.
-- `completed_at` estaba en `metadata`; pasa a columna para poder ordenar.
ALTER TABLE "team_prompt_runs" ADD COLUMN IF NOT EXISTS "variables" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "team_prompt_runs" ADD COLUMN IF NOT EXISTS "mode" varchar(12) NOT NULL DEFAULT 'queue';
ALTER TABLE "team_prompt_runs" ADD COLUMN IF NOT EXISTS "output" text;
ALTER TABLE "team_prompt_runs" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;

UPDATE "team_prompt_runs"
   SET "completed_at" = ("metadata" ->> 'completedAt')::timestamp
 WHERE "completed_at" IS NULL AND "metadata" ? 'completedAt';

CREATE INDEX IF NOT EXISTS "team_prompt_runs_status_idx" ON "team_prompt_runs" ("team_id","status","created_at");
