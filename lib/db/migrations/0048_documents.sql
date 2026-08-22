-- App DOCUMENTOS: editor tipo Notion con carpetas anidadas y notas enlazadas.
-- El contenido se guarda como JSON de ProseMirror, nunca HTML del usuario.

CREATE TABLE IF NOT EXISTS "team_document_folders" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "parent_id" integer REFERENCES "team_document_folders"("id") ON DELETE cascade,
  "name" varchar(120) NOT NULL,
  "emoji" varchar(16),
  "depth" integer DEFAULT 1 NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  -- Máximo 5 niveles. La raíz es depth 1 y no tiene padre; todo lo demás cuelga de alguien.
  CONSTRAINT "team_document_folders_depth_check" CHECK (
    ("parent_id" IS NULL AND "depth" = 1)
    OR ("parent_id" IS NOT NULL AND "depth" BETWEEN 2 AND 5)
  )
);
CREATE INDEX IF NOT EXISTS "team_document_folders_team_idx" ON "team_document_folders" ("team_id");
CREATE INDEX IF NOT EXISTS "team_document_folders_parent_idx" ON "team_document_folders" ("parent_id");

CREATE TABLE IF NOT EXISTS "team_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  -- Borrar la carpeta NO borra los documentos: caen a la raíz.
  "folder_id" integer REFERENCES "team_document_folders"("id") ON DELETE set null,
  "title" varchar(200) DEFAULT 'Documento sin título' NOT NULL,
  "slug" varchar(220) NOT NULL,
  "emoji" varchar(16),
  "content" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
  "content_text" text DEFAULT '' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_documents_team_slug_uidx" UNIQUE ("team_id", "slug")
);
CREATE INDEX IF NOT EXISTS "team_documents_team_idx" ON "team_documents" ("team_id");
CREATE INDEX IF NOT EXISTS "team_documents_folder_idx" ON "team_documents" ("folder_id");
CREATE INDEX IF NOT EXISTS "team_documents_updated_idx" ON "team_documents" ("team_id", "updated_at");

-- Enlaces entre documentos. Se recalculan enteros en cada guardado.
CREATE TABLE IF NOT EXISTS "team_document_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "source_document_id" integer NOT NULL REFERENCES "team_documents"("id") ON DELETE cascade,
  "target_document_id" integer NOT NULL REFERENCES "team_documents"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "team_document_links_pair_uidx" UNIQUE ("source_document_id", "target_document_id")
);
CREATE INDEX IF NOT EXISTS "team_document_links_target_idx" ON "team_document_links" ("target_document_id");

CREATE TABLE IF NOT EXISTS "team_document_media" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "document_id" integer REFERENCES "team_documents"("id") ON DELETE cascade,
  "url" text NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(180),
  "size_bytes" integer,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "team_document_media_document_idx" ON "team_document_media" ("document_id");
