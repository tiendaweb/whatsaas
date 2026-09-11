-- El interruptor del equipo vuelve a mandar.
--
-- `ai_sessions.status` cumplía dos papeles a la vez: guardar la conversación
-- del agente y, sin querer, decidir si el agente contesta. Como el motor crea
-- la sesión con `status = 'active'` la primera vez que responde, ese valor se
-- leía después como "esta conversación tiene la IA prendida a propósito" y
-- ganaba sobre `ai_configs.is_active`. Resultado: apagar el bot del equipo no
-- apagaba ningún chat donde ya hubiera contestado alguna vez — el 2026-09-10 a
-- las 02:23 le escribió sola a un contacto personal de Contratá Ya, con el
-- guion de ventas, doce horas después de que apagaran el bot. Dos equipos con
-- el bot apagado tenían 230 chats en esa condición.
--
-- Ahora el override es explícito: sólo cuenta si una persona (o un nodo de
-- automatización) tocó el interruptor de ESE chat. Sin override, el chat hereda
-- lo que diga el equipo, que es lo que cualquiera espera al apagar el bot.
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "is_override" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "override_by" integer REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "override_at" timestamp;
--> statement-breakpoint
-- Las pausas SÍ las puso alguien: el motor nunca crea una sesión pausada, así
-- que una sesión `paused` es siempre una decisión humana y se respeta tal cual.
-- Las `active`, en cambio, las crea el motor al responder: pasan a heredar del
-- equipo. Un equipo con el bot prendido no nota el cambio; uno con el bot
-- apagado deja de mandar mensajes que nadie pidió.
UPDATE "ai_sessions" SET "is_override" = true, "override_at" = now() WHERE "status" = 'paused';
