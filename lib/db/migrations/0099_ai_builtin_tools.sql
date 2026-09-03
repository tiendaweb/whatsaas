-- Agente IA: funciones integradas por app.
--
-- Hasta hoy el agente de WhatsApp sólo tenía `handover_to_human` más las
-- herramientas que cada equipo arma a mano en Ajustes → IA (enviar archivo,
-- mover de etapa, etiquetar…). Las apps (Calendario, Tareas, Clientes,
-- Membresías, Finanzas, Documentos, etc.) no le exponían nada, así que el bot
-- no podía consultar un turno libre, registrar un pago o buscar en la base de
-- conocimiento aunque el equipo tuviera esas apps activas.
--
-- Las funciones integradas se declaran en código (lib/plugins/ai-chat/builtin/)
-- y se activan solas cuando el plugin que las respalda está activo para el
-- equipo. Esta tabla guarda únicamente las EXCEPCIONES: un equipo puede apagar
-- una función puntual sin desactivar la app. Sin fila = activa.

CREATE TABLE IF NOT EXISTS "ai_builtin_tools" (
  "id" serial PRIMARY KEY,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "tool_name" varchar(60) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_builtin_tools_team_tool_idx" ON "ai_builtin_tools" ("team_id","tool_name");
