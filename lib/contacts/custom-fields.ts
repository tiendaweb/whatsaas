import { db } from '@/lib/db/drizzle';
import { relationExists } from '@/lib/db/relation-exists';
import { sql } from 'drizzle-orm';

let customFieldsBootstrapped = false;

export async function ensureCustomFieldsTable() {
  if (customFieldsBootstrapped) return;

  if (!(await relationExists('custom_fields'))) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS custom_fields (
        id serial PRIMARY KEY,
        team_id integer NOT NULL REFERENCES teams(id) ON DELETE cascade,
        name varchar(100) NOT NULL,
        key varchar(100) NOT NULL,
        type varchar(20) NOT NULL DEFAULT 'text',
        position integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS team_field_key_idx
      ON custom_fields (team_id, key);
    `);
  } else {
    // Add position column to existing installations (no-op if already exists)
    await db.execute(sql`
      ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
    `);
  }

  customFieldsBootstrapped = true;
}
