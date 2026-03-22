import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

export async function relationExists(relationName: string) {
  const qualifiedName = `public.${relationName}`;
  const result = await db.execute(sql`
    SELECT to_regclass(${qualifiedName})::text AS relation_name
  `);

  const relation = (result as { rows?: Array<{ relation_name: string | null }> }).rows?.[0]?.relation_name;
  return relation === qualifiedName;
}
