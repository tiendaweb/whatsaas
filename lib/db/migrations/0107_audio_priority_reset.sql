-- Quita la prioridad que el clasificador les había puesto a los audios que encolaba.
--
-- `classifyChat` encolaba con priority 10 y requested_by 'auto' cada audio sin
-- ficha del chat que auditaba, y como audita primero a los clientes que ya
-- cerraron, 173 audios de contactos G11 quedaron adelante de todo lo demás en
-- la cola de Gemini. El orden lo deciden ahora el frente comercial y los
-- bloques de Audios; la prioridad queda sólo para lo que una persona pide a
-- mano (requested_by 'ui'), que se conserva.
UPDATE "message_audio_insights"
   SET "priority" = 0, "updated_at" = now()
 WHERE "status" IN ('queued', 'failed', 'pending')
   AND "priority" <> 0
   AND "requested_by" <> 'ui';
