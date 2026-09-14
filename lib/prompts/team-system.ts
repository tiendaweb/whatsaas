import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPrompts } from '@/lib/db/schema';

export type ActiveTeamPrompt = {
  id: number | null;
  key: string;
  version: number;
  title: string;
  systemPrompt: string;
  userTemplate: string;
  source: 'db' | 'default';
};

/** Resuelve el documento activo del equipo; el texto del código queda como base recuperable. */
export async function getTeamSystemPrompt(
  teamId: number,
  definition: { key: string; title: string; systemPrompt: string; userTemplate: string },
): Promise<ActiveTeamPrompt> {
  const row = await db.query.teamPrompts.findFirst({
    where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, definition.key), eq(teamPrompts.status, 'active')),
    columns: { id: true, key: true, version: true, title: true, systemPrompt: true, userTemplate: true },
  });
  if (row && row.systemPrompt.trim()) {
    return { id: row.id, key: row.key, version: row.version, title: row.title, systemPrompt: row.systemPrompt, userTemplate: row.userTemplate, source: 'db' };
  }
  return {
    id: null,
    key: definition.key,
    version: 0,
    title: definition.title,
    systemPrompt: definition.systemPrompt,
    userTemplate: definition.userTemplate,
    source: 'default',
  };
}

/** Reemplaza variables declaradas; una variable ausente nunca deja llaves filtradas al modelo. */
export function renderTeamPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => vars[name] ?? '');
}
