import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskTemplates } from '@/lib/db/schema';
import { TaskOpsError } from './errors';

export const TASK_TEMPLATE_TYPES = ['task', 'project', 'labels'] as const;
export type TaskTemplateType = (typeof TASK_TEMPLATE_TYPES)[number];

export function isTaskTemplateType(value: unknown): value is TaskTemplateType {
  return typeof value === 'string' && (TASK_TEMPLATE_TYPES as readonly string[]).includes(value);
}

/** Plantillas del equipo, las más recientes primero. `type` acota a un tipo. */
export async function listTaskTemplates(teamId: number, type?: TaskTemplateType | null) {
  return db.query.teamTaskTemplates.findMany({
    where: type
      ? and(eq(teamTaskTemplates.teamId, teamId), eq(teamTaskTemplates.type, type))
      : eq(teamTaskTemplates.teamId, teamId),
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
}

/**
 * Crea una plantilla. El payload es lo que la UI vuelve a hidratar al aplicar
 * la plantilla (los campos de una tarea, las columnas de un proyecto o un set de
 * etiquetas): acá no se valida su forma, sólo el tipo y el nombre.
 */
export async function createTaskTemplate(
  teamId: number,
  userId: number,
  input: { type: string; name: string; payload?: Record<string, unknown> | null },
) {
  const name = String(input.name ?? '').trim();
  if (!isTaskTemplateType(input.type) || !name) throw new TaskOpsError('type and name required', 400);

  const [template] = await db.insert(teamTaskTemplates).values({
    teamId,
    type: input.type,
    name,
    payload: input.payload ?? {},
    createdBy: userId,
  }).returning();

  return template;
}
