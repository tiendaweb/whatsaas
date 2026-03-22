import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

let customFieldsBootstrapped = false;

export async function ensureCustomFieldsTable() {
  if (customFieldsBootstrapped) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id serial PRIMARY KEY,
      team_id integer NOT NULL REFERENCES teams(id) ON DELETE cascade,
      name varchar(100) NOT NULL,
      key varchar(100) NOT NULL,
      type varchar(20) NOT NULL DEFAULT 'text',
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS team_field_key_idx
    ON custom_fields (team_id, key);
  `);

  customFieldsBootstrapped = true;
}
