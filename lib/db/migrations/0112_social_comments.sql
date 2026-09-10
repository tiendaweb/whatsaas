-- Comentarios de Facebook e Instagram, para contestarlos desde acá.
--
-- Hasta ahora las redes eran de una sola vía: se publicaba desde WhatsPro y
-- había que entrar a Facebook o a Instagram para ver si alguien había
-- comentado —y entrar significa iniciar sesión y verificar la cuenta cada vez—.
-- Los comentarios entran acá con el mismo Page Access Token que ya usa el
-- publicador, se responden desde la bandeja y queda el rastro de quién
-- contestó qué.
--
-- La fila es el comentario tal como vive en Meta (`external_id` manda) más lo
-- nuestro: en qué estado está para el equipo y con qué se respondió.
CREATE TABLE IF NOT EXISTS "social_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "account_id" integer REFERENCES "social_accounts"("id") ON DELETE set null,
  "platform" varchar(20) NOT NULL,
  "external_id" text NOT NULL,
  "parent_external_id" text,
  "post_external_id" text NOT NULL,
  "post_permalink" text,
  "post_excerpt" text,
  "author_name" text,
  "author_external_id" text,
  "message" text DEFAULT '' NOT NULL,
  "comment_created_at" timestamp,
  -- nuevo | respondido | ignorado | oculto
  "status" varchar(16) DEFAULT 'nuevo' NOT NULL,
  "is_hidden" boolean DEFAULT false NOT NULL,
  "like_count" integer DEFAULT 0 NOT NULL,
  "reply_text" text,
  "reply_external_id" text,
  "replied_at" timestamp,
  "replied_by" integer REFERENCES "users"("id") ON DELETE set null,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- El comentario de Meta es la identidad: sincronizar dos veces no duplica.
CREATE UNIQUE INDEX IF NOT EXISTS "social_comments_external_uidx" ON "social_comments" ("team_id", "platform", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_comments_bandeja_idx" ON "social_comments" ("team_id", "status", "comment_created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_comments_post_idx" ON "social_comments" ("team_id", "post_external_id");
