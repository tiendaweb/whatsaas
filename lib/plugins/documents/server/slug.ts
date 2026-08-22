import { and, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocuments } from '@/lib/db/schema';

export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

  return base || 'documento';
}

/** Slug único dentro del equipo. Si ya existe, agrega -2, -3, … */
export async function uniqueSlug(teamId: number, title: string, excludeId?: number): Promise<string> {
  const base = slugify(title);

  const taken = await db
    .select({ slug: teamDocuments.slug, id: teamDocuments.id })
    .from(teamDocuments)
    .where(and(eq(teamDocuments.teamId, teamId), like(teamDocuments.slug, `${base}%`)));

  const used = new Set(taken.filter((row) => row.id !== excludeId).map((row) => row.slug));
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
