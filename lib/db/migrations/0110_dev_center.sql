-- Centro de Desarrollo (plugin `dev-center`, activación por usuario: hoy sólo Noelia).
--
-- Misiones (doc 04 §2 `developer_missions` del plan Developer Command Center)
-- y biblioteca de prompts. Una misión es un pedido de trabajo técnico sobre un
-- proyecto del registro (config/terminal-projects.json) que se ejecuta de una
-- de dos maneras: en una TERMINAL con Claude Code o Codex (el prompt se tipea
-- en la sesión tmux) o por un CONECTOR de IA (la misión se encola como corrida
-- en team_prompt_runs y el conector la toma desde whatspro_work_queue). El
-- estado de las de conector se lee de la corrida; `prompt_run_id` es el enlace.
CREATE TABLE IF NOT EXISTS "developer_prompts" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "key" varchar(64) NOT NULL,
  "title" varchar(160) NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "description" text,
  "agent_default" varchar(16) NOT NULL DEFAULT 'claude',
  "project_default" varchar(40),
  "mode_default" varchar(16) NOT NULL DEFAULT 'editar',
  "variables" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "pinned" boolean NOT NULL DEFAULT false,
  "usage_count" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamp,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "developer_prompts_key_idx" ON "developer_prompts" ("team_id", "key");

CREATE TABLE IF NOT EXISTS "developer_missions" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "project" varchar(40) NOT NULL,
  "agent" varchar(16) NOT NULL,
  "mode" varchar(16) NOT NULL DEFAULT 'editar',
  "title" varchar(200) NOT NULL,
  "prompt" text NOT NULL DEFAULT '',
  "status" varchar(16) NOT NULL DEFAULT 'draft',
  "priority" smallint NOT NULL DEFAULT 2,
  "prompt_id" integer REFERENCES "developer_prompts"("id") ON DELETE SET NULL,
  "prompt_run_id" integer REFERENCES "team_prompt_runs"("id") ON DELETE SET NULL,
  "tmux_name" varchar(80),
  "result_summary" text,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "developer_missions_team_status_idx" ON "developer_missions" ("team_id", "status", "updated_at");
