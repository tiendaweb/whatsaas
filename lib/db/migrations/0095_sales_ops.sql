-- Command Center Comercial (plugin sales-ops): capa DERIVADA de sólo lectura.
-- Ninguna tabla del CRM cambia. docs/command-center-comercial/03-MODELO-DE-DATOS.md
CREATE TABLE IF NOT EXISTS "team_commercial_analysis" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "chat_id" integer NOT NULL REFERENCES "chats"("id") ON DELETE CASCADE,
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "version" integer NOT NULL DEFAULT 0,
  "fingerprint" varchar(64),
  "stale" boolean NOT NULL DEFAULT false,
  "first_contact_at" timestamptz,
  "last_customer_message_at" timestamptz,
  "last_team_message_at" timestamptz,
  "last_human_message_at" timestamptz,
  "source" varchar(24) NOT NULL DEFAULT 'desconocido',
  "source_detail" varchar(120),
  "current_gate" varchar(4),
  "max_gate" varchar(4),
  "drop_gate" varchar(4),
  "drop_reason" varchar(40),
  "confidence" smallint NOT NULL DEFAULT 0,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "business_type" varchar(120),
  "need" varchar(24) NOT NULL DEFAULT 'indefinida',
  "need_detail" varchar(300),
  "quoted_price" integer,
  "quoted_currency" varchar(3),
  "proposal_summary" varchar(600),
  "objection_type" varchar(24) NOT NULL DEFAULT 'ninguna',
  "objection_detail" varchar(300),
  "intent" varchar(16) NOT NULL DEFAULT 'ninguna',
  "intent_score" smallint NOT NULL DEFAULT 0,
  "temperature" varchar(8) NOT NULL DEFAULT 'cold',
  "recovery_probability" smallint NOT NULL DEFAULT 0,
  "potential_value_usd" integer NOT NULL DEFAULT 0,
  "collection_speed" varchar(12) NOT NULL DEFAULT 'indefinida',
  "priority_score" integer NOT NULL DEFAULT 0,
  "followups_total" smallint NOT NULL DEFAULT 0,
  "followups_automated" smallint NOT NULL DEFAULT 0,
  "followups_manual" smallint NOT NULL DEFAULT 0,
  "last_followup_at" timestamptz,
  "automation_active" boolean NOT NULL DEFAULT false,
  "is_existing_customer" boolean NOT NULL DEFAULT false,
  "customer_evidence" varchar(40) NOT NULL DEFAULT 'none',
  "payment_pending" boolean NOT NULL DEFAULT false,
  "auto_reply_detected" boolean NOT NULL DEFAULT false,
  "evidence_gap" boolean NOT NULL DEFAULT false,
  "last_prospect_action" varchar(300),
  "last_team_action" varchar(300),
  "recommended_action" varchar(400),
  "recommended_owner" varchar(12) NOT NULL DEFAULT 'nadie',
  "status" varchar(24) NOT NULL DEFAULT 'sin_analizar',
  "status_reason" varchar(300),
  "next_action_at" date,
  "notes_for_human" text,
  "crm_to_fix" text,
  "prior_radar" jsonb,
  "analyzed_at" timestamptz,
  "analyzed_by" varchar(16),
  "provider" varchar(40),
  "model" varchar(80),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_commercial_analysis_chat_idx" ON "team_commercial_analysis" ("team_id","chat_id");
CREATE INDEX IF NOT EXISTS "team_commercial_analysis_gate_priority_idx" ON "team_commercial_analysis" ("team_id","current_gate","priority_score");
CREATE INDEX IF NOT EXISTS "team_commercial_analysis_status_idx" ON "team_commercial_analysis" ("team_id","status");
CREATE INDEX IF NOT EXISTS "team_commercial_analysis_owner_idx" ON "team_commercial_analysis" ("team_id","recommended_owner","priority_score");
CREATE INDEX IF NOT EXISTS "team_commercial_analysis_stale_idx" ON "team_commercial_analysis" ("team_id","stale");
CREATE INDEX IF NOT EXISTS "team_commercial_analysis_next_action_idx" ON "team_commercial_analysis" ("team_id","next_action_at");

CREATE TABLE IF NOT EXISTS "team_commercial_analysis_versions" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "analysis_id" integer NOT NULL REFERENCES "team_commercial_analysis"("id") ON DELETE CASCADE,
  "chat_id" integer NOT NULL,
  "version" integer NOT NULL,
  "reason" varchar(24) NOT NULL,
  "prompt_run_id" integer,
  "snapshot" jsonb NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "diff" jsonb,
  "analyzed_by" varchar(16),
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_commercial_analysis_versions_unique" ON "team_commercial_analysis_versions" ("analysis_id","version");
CREATE INDEX IF NOT EXISTS "team_commercial_analysis_versions_chat_idx" ON "team_commercial_analysis_versions" ("team_id","chat_id");

CREATE TABLE IF NOT EXISTS "team_commercial_signals" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "chat_id" integer NOT NULL REFERENCES "chats"("id") ON DELETE CASCADE,
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "message_id" text NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "kind" varchar(24) NOT NULL,
  "confidence" smallint NOT NULL DEFAULT 0,
  "excerpt" varchar(300) NOT NULL DEFAULT '',
  "triggered_by_action_id" integer,
  "gate_before" varchar(4),
  "gate_after" varchar(4),
  "status" varchar(12) NOT NULL DEFAULT 'new',
  "handled_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_at" timestamptz,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_commercial_signals_message_idx" ON "team_commercial_signals" ("team_id","message_id");
CREATE INDEX IF NOT EXISTS "team_commercial_signals_status_idx" ON "team_commercial_signals" ("team_id","status","created_at");
CREATE INDEX IF NOT EXISTS "team_commercial_signals_kind_idx" ON "team_commercial_signals" ("team_id","kind");

CREATE TABLE IF NOT EXISTS "team_commercial_experiments" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "hypothesis" text,
  "segment_gates" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "message_a" text,
  "message_b" text,
  "status" varchar(12) NOT NULL DEFAULT 'draft',
  "started_at" timestamptz,
  "ended_at" timestamptz,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_commercial_experiments_team_idx" ON "team_commercial_experiments" ("team_id","status");

CREATE TABLE IF NOT EXISTS "team_commercial_actions" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "chat_id" integer NOT NULL REFERENCES "chats"("id") ON DELETE CASCADE,
  "contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "batch_id" varchar(64) NOT NULL,
  "batch_label" varchar(120) NOT NULL,
  "experiment_id" integer REFERENCES "team_commercial_experiments"("id") ON DELETE SET NULL,
  "variant" varchar(8),
  "kind" varchar(24) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "gate_at_creation" varchar(4),
  "status" varchar(20) NOT NULL DEFAULT 'proposed',
  "requires_role" varchar(12) NOT NULL DEFAULT 'any',
  "proposed_by" varchar(24) NOT NULL DEFAULT 'ia',
  "approved_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "executed_at" timestamptz,
  "executed_via" varchar(20),
  "result_message_id" text,
  "result" jsonb,
  "scheduled_for" timestamptz,
  "expires_at" timestamptz,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_commercial_actions_status_idx" ON "team_commercial_actions" ("team_id","status","scheduled_for");
CREATE INDEX IF NOT EXISTS "team_commercial_actions_batch_idx" ON "team_commercial_actions" ("team_id","batch_id");
CREATE INDEX IF NOT EXISTS "team_commercial_actions_chat_idx" ON "team_commercial_actions" ("team_id","chat_id","created_at");
-- Invariante: un solo envío aprobado/en curso por chat a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS "team_commercial_actions_one_send_idx" ON "team_commercial_actions" ("team_id","chat_id")
  WHERE "kind" = 'send_message' AND "status" IN ('approved','executing');

CREATE TABLE IF NOT EXISTS "team_commercial_experiment_members" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "experiment_id" integer NOT NULL REFERENCES "team_commercial_experiments"("id") ON DELETE CASCADE,
  "chat_id" integer NOT NULL REFERENCES "chats"("id") ON DELETE CASCADE,
  "variant" varchar(8) NOT NULL DEFAULT 'A',
  "eligible_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "responded_at" timestamptz,
  "recovered_at" timestamptz,
  "proposal_at" timestamptz,
  "paid_at" timestamptz,
  "revenue_cents" integer,
  "currency" varchar(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_commercial_experiment_members_unique" ON "team_commercial_experiment_members" ("experiment_id","chat_id");

CREATE TABLE IF NOT EXISTS "team_prompts" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "key" varchar(64) NOT NULL,
  "title" varchar(160) NOT NULL,
  "purpose" varchar(24) NOT NULL DEFAULT 'custom',
  "audience" varchar(12) NOT NULL DEFAULT 'both',
  "version" integer NOT NULL DEFAULT 1,
  "status" varchar(12) NOT NULL DEFAULT 'draft',
  "system_prompt" text NOT NULL DEFAULT '',
  "user_template" text NOT NULL DEFAULT '',
  "output_schema" jsonb,
  "tool_chain" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_prompts_key_version_idx" ON "team_prompts" ("team_id","key","version");
CREATE UNIQUE INDEX IF NOT EXISTS "team_prompts_one_active_idx" ON "team_prompts" ("team_id","key") WHERE "status" = 'active';

CREATE TABLE IF NOT EXISTS "team_prompt_runs" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "prompt_id" integer REFERENCES "team_prompts"("id") ON DELETE SET NULL,
  "prompt_key" varchar(64) NOT NULL,
  "prompt_version" integer NOT NULL DEFAULT 0,
  "prompt_fingerprint" varchar(64) NOT NULL,
  "prompt_snapshot" text NOT NULL DEFAULT '',
  "target_kind" varchar(12) NOT NULL,
  "target_id" varchar(64) NOT NULL,
  "connector" varchar(16) NOT NULL DEFAULT 'server',
  "status" varchar(12) NOT NULL DEFAULT 'completed',
  "input_tokens" integer,
  "output_tokens" integer,
  "summary" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "team_prompt_runs_target_idx" ON "team_prompt_runs" ("team_id","target_kind","target_id");
CREATE INDEX IF NOT EXISTS "team_prompt_runs_key_idx" ON "team_prompt_runs" ("team_id","prompt_key","created_at");

-- Plugin: apagado por defecto, activado sólo para el equipo 2.
INSERT INTO plugin_system_states (plugin_id, enabled_by_default) VALUES ('sales-ops', false) ON CONFLICT DO NOTHING;
-- Sólo si ese equipo y ese usuario existen: en una instalación nueva no hay
-- ninguno de los dos y la migración fallaba por la clave foránea, cortando la
-- instalación a mitad de camino. Ahí el plugin se habilita desde Admin.
INSERT INTO team_plugins (team_id, plugin_id, installed, enabled, settings, installed_by, installed_at, updated_at)
  SELECT 2, 'sales-ops', true, true, '{}'::jsonb, 3, now(), now()
  WHERE EXISTS (SELECT 1 FROM teams WHERE id = 2) AND EXISTS (SELECT 1 FROM users WHERE id = 3)
  ON CONFLICT DO NOTHING;
