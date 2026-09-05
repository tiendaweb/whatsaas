-- La tabla estaba declarada en `lib/db/schema.ts` desde siempre y NUNCA se creó
-- en la base: no había ningún .sql que la generara. Consecuencia: todo el flujo
-- de "olvidé mi contraseña" (app/[locale]/(login)/password-reset-actions.ts) y
-- el link de reseteo que genera el admin (admin-actions.ts:257) fallaban con
-- "relation does not exist". Se detectó comparando schema.ts contra
-- information_schema de la base.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token" varchar(255) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);

DO $$ BEGIN
  ALTER TABLE "password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La validación busca por token vigente y sin usar; el índice cubre ese camino.
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx" ON "password_reset_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_idx" ON "password_reset_tokens" ("expires_at");
