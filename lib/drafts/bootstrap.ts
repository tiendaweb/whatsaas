import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { relationExists } from '@/lib/db/relation-exists';

type DraftBootstrapResult =
  | { ok: true }
  | {
      ok: false;
      clientMessage: string;
      status: number;
    };

function isRelationMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeCode = 'code' in error ? error.code : undefined;
  const maybeMessage = 'message' in error ? error.message : undefined;

  return (
    maybeCode === '42P01' ||
    (typeof maybeMessage === 'string' &&
      maybeMessage.toLowerCase().includes('relation') &&
      maybeMessage.toLowerCase().includes('does not exist'))
  );
}

function logDraftStorageError(scope: string, error: unknown) {
  console.error({
    scope: 'drafts.storage',
    action: scope,
    message: 'draft storage bootstrap failed',
    errorCode: typeof error === 'object' && error && 'code' in error ? error.code : undefined,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

let draftTablesBootstrapped = false;

async function bootstrapDraftTables() {
  if (draftTablesBootstrapped) return;

  const [hasDrafts, hasCategories, hasTags, hasTagLinks] = await Promise.all([
    relationExists('message_drafts'),
    relationExists('message_draft_categories'),
    relationExists('message_draft_tags'),
    relationExists('message_draft_tag_links'),
  ]);

  if (!hasCategories) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_draft_categories (
        id serial PRIMARY KEY,
        team_id integer NOT NULL REFERENCES teams(id) ON DELETE cascade,
        name varchar(100) NOT NULL,
        color varchar(20) DEFAULT 'gray',
        "order" integer NOT NULL DEFAULT 0,
        position integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT team_message_draft_category_name_idx UNIQUE (team_id, name)
      );
    `);
  }

  await db.execute(sql`
    ALTER TABLE message_draft_categories
    ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
  `);

  await db.execute(sql`
    UPDATE message_draft_categories
    SET position = "order"
    WHERE position = 0;
  `);

  if (!hasTags) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_draft_tags (
        id serial PRIMARY KEY,
        team_id integer NOT NULL REFERENCES teams(id) ON DELETE cascade,
        name varchar(100) NOT NULL,
        color varchar(20) DEFAULT 'gray',
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT team_message_draft_tag_name_idx UNIQUE (team_id, name)
      );
    `);
  }

  if (!hasDrafts) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_drafts (
        id serial PRIMARY KEY,
        team_id integer NOT NULL REFERENCES teams(id) ON DELETE cascade,
        title varchar(255) NOT NULL,
        content text NOT NULL,
        category_id integer REFERENCES message_draft_categories(id) ON DELETE set null,
        contact_id integer REFERENCES contacts(id) ON DELETE set null,
        assigned_user_id integer REFERENCES users(id) ON DELETE set null,
        department_id integer REFERENCES departments(id) ON DELETE set null,
        stages jsonb,
        is_archived boolean NOT NULL DEFAULT false,
        created_by integer NOT NULL REFERENCES users(id) ON DELETE cascade,
        updated_by integer NOT NULL REFERENCES users(id) ON DELETE cascade,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
  }

  if (!hasTagLinks) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_draft_tag_links (
        draft_id integer NOT NULL REFERENCES message_drafts(id) ON DELETE cascade,
        tag_id integer NOT NULL REFERENCES message_draft_tags(id) ON DELETE cascade,
        CONSTRAINT message_draft_tag_link_idx UNIQUE (draft_id, tag_id)
      );
    `);
  }

  draftTablesBootstrapped = true;
}

export async function ensureDraftStorage(scope: string): Promise<DraftBootstrapResult> {
  try {
    await bootstrapDraftTables();
    return { ok: true };
  } catch (error) {
    logDraftStorageError(scope, error);

    if (isRelationMissingError(error)) {
      return {
        ok: false,
        status: 503,
        clientMessage:
          'No se pudo inicializar el almacenamiento de borradores. Intenta nuevamente o contacta soporte.',
      };
    }

    return {
      ok: false,
      status: 500,
      clientMessage: 'Error inicializando borradores. Intenta nuevamente en unos minutos.',
    };
  }
}
