-- Bloques de trabajo que no son de producción.
--
-- `team_task_work_sessions` sólo aceptaba sesiones colgadas de un pedido de
-- producción, así que los bloques de 25 minutos del Command Center —el
-- comercial, el de supervisión y el Modo Noelia— no dejaban rastro: en toda la
-- base hay UNA sesión registrada y cero horas, y con eso el evaluador de US$/h
-- y la línea roja del catálogo no pueden dispararse nunca.
--
-- Se agrega `context` para saber en qué se fue el bloque y `chat_id` para los
-- que se trabajan contra un contacto. `task_id` pasa a ser opcional: un bloque
-- comercial no tiene tarea, y forzar una inventaría pedidos de producción.
ALTER TABLE "team_task_work_sessions" ALTER COLUMN "task_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_task_work_sessions" ADD COLUMN IF NOT EXISTS "context" varchar(16) NOT NULL DEFAULT 'produccion';
--> statement-breakpoint
ALTER TABLE "team_task_work_sessions" ADD COLUMN IF NOT EXISTS "chat_id" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_task_work_sessions_context_idx" ON "team_task_work_sessions" ("team_id", "context", "started_at");
