-- Columnas que el código declara en schema.ts pero que ninguna migración
-- creaba: en whatspro.uno existen porque se agregaron a mano o desde el
-- arranque de la app, así que acá son no-op. En una instalación nueva son
-- imprescindibles: sin `users.enable_signature` falla hasta el login, porque
-- drizzle nombra todas las columnas en cada SELECT.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "enable_signature" boolean NOT NULL DEFAULT false;

ALTER TABLE "ai_tools" ADD COLUMN IF NOT EXISTS "type" varchar(30) NOT NULL DEFAULT 'media';
ALTER TABLE "ai_tools" ADD COLUMN IF NOT EXISTS "action_data" jsonb;

-- Las tres de landing_pages las crea `lib/landing/storage.ts` al arrancar;
-- tenerlas también acá evita que la primera pantalla que las consulte sea la
-- que descubra que faltan.
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "sections" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "content_mode" varchar(20) NOT NULL DEFAULT 'builder';
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "external_prompt" text NOT NULL DEFAULT '';
