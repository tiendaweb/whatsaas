-- Google retiró `gemini-2.5-flash` para los proyectos nuevos: devuelve
-- 404 "no longer available to new users" al primer request. El default de la
-- columna todavía apuntaba ahí, así que cada key cargada nacía rota.
ALTER TABLE "team_gemini_keys" ALTER COLUMN "model" SET DEFAULT 'gemini-3.6-flash';

UPDATE "team_gemini_keys" SET "model" = 'gemini-3.6-flash', "updated_at" = now()
WHERE "model" = 'gemini-2.5-flash';

UPDATE "ai_configs" SET "model" = 'gemini-3.6-flash', "updated_at" = now()
WHERE "provider" = 'gemini' AND "model" = 'gemini-2.5-flash';
