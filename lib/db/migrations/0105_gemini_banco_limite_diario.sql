-- El límite diario por key del banco de Gemini estaba en 20.
--
-- No era el de Google: es un tope nuestro, y con 13 keys dejaba el banco entero
-- en 260 pedidos por día. Peor, se combinaba con un bug —cualquier 429, incluso
-- el de "vas muy rápido" por minuto, marcaba la key agotada hasta mañana—, así
-- que un pico de clasificación apagaba las trece de una y el sistema informaba
-- "no hay keys con cuota" mientras la API seguía respondiendo OK.
--
-- El techo real lo sigue poniendo Google: un 429 por día saca la key sola. Esto
-- sube sólo las que quedaron en el default viejo, no las que alguien ajustó a
-- mano.
UPDATE "team_gemini_keys" SET "limit_rpd" = 200 WHERE "limit_rpd" = 20;

-- Y devuelve a la rotación las que hoy figuran llenas por ese bug: el contador
-- decía 20 de 20 porque `marcarAgotada` rellena hasta el límite, no porque se
-- hayan hecho 20 llamadas buenas.
UPDATE "team_gemini_key_usage" u
   SET "requests" = LEAST(u."requests", GREATEST(0, u."requests" - u."quota_errors"))
  FROM "team_gemini_keys" k
 WHERE u."key_id" = k."id"
   AND u."day" = CURRENT_DATE
   AND u."quota_errors" > 0;
