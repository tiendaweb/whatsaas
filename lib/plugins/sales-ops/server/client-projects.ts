import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, teamTaskProjects, teamTaskWorkspaces } from '@/lib/db/schema';
import { createColumnInProject, createTaskInColumn, insertRelation } from '@/lib/plugins/tasks/server/task-os';

/**
 * Proyecto de un cliente en Tareas OS, separado donde corresponde.
 *
 * Cada cliente que contrata algo tiene su propio proyecto dentro del workspace
 * "Clientes" (uno por equipo), con tres columnas y las tareas que el conector
 * o la persona ya saben que hacen falta. Queda vinculado al contacto, así que
 * desde la ficha del chat se ve el proyecto y desde el proyecto, el chat.
 *
 * Si el proyecto del cliente ya existe (mismo nombre en el workspace), se
 * reutiliza y las tareas nuevas se suman a su primera columna: pedir dos veces
 * "armale el proyecto" no debe dejar dos tableros.
 */
export const CLIENTS_WORKSPACE_NAME = 'Clientes';
const DEFAULT_COLUMNS = ['Por hacer', 'En curso', 'Hecho'];

export async function createClientProject(input: {
  teamId: number;
  userId: number;
  contactId: number;
  workspaceName?: string;
  projectName?: string;
  brief?: string;
  aiPrompt?: string;
  columns?: string[];
  tasks?: Array<{ title: string; notes?: string; dueDate?: string | null; column?: string }>;
}): Promise<{ workspaceId: number; projectId: number; created: boolean; taskIds: number[] } | { error: string }> {
  const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.id, input.contactId), eq(contacts.teamId, input.teamId)), columns: { id: true, name: true, company: true } });
  if (!contact) return { error: 'contact_not_found' };

  const workspaceName = (input.workspaceName?.trim() || CLIENTS_WORKSPACE_NAME).slice(0, 200);
  let workspace = await db.query.teamTaskWorkspaces.findFirst({ where: and(eq(teamTaskWorkspaces.teamId, input.teamId), eq(teamTaskWorkspaces.name, workspaceName)) });
  if (!workspace) {
    [workspace] = await db.insert(teamTaskWorkspaces).values({ teamId: input.teamId, name: workspaceName, order: 40, icon: 'briefcase', createdBy: input.userId }).returning();
  }

  const projectName = (input.projectName?.trim() || contact.company?.trim() || contact.name?.trim() || `Cliente #${contact.id}`).slice(0, 200);
  let project = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.teamId, input.teamId), eq(teamTaskProjects.workspaceId, workspace.id), eq(teamTaskProjects.name, projectName)),
  });
  let created = false;
  if (!project) {
    [project] = await db
      .insert(teamTaskProjects)
      .values({ teamId: input.teamId, workspaceId: workspace.id, name: projectName, order: 0, icon: 'briefcase', aiPrompt: (input.aiPrompt ?? input.brief ?? '').slice(0, 20000), createdBy: input.userId })
      .returning();
    created = true;
    for (const title of input.columns?.length ? input.columns : DEFAULT_COLUMNS) {
      await createColumnInProject({ teamId: input.teamId, projectId: project.id, title });
    }
    await insertRelation({
      teamId: input.teamId,
      userId: input.userId,
      sourceType: 'project',
      sourceId: project.id,
      targetType: 'contact',
      targetId: contact.id,
      relationType: 'related',
      metadata: { source: 'sales-ops:client_project' },
    });
  }

  const columns = await db.query.teamTaskColumns.findMany({
    where: (t, { eq: eqf }) => eqf(t.projectId, project!.id),
    orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
  });
  const porTitulo = new Map(columns.map((c) => [c.title.toLowerCase(), c]));
  const primera = columns[0];
  if (!primera) return { error: 'project_without_columns' };

  const taskIds: number[] = [];
  for (const t of input.tasks ?? []) {
    const columna = (t.column && porTitulo.get(t.column.toLowerCase())) || primera;
    const task = await createTaskInColumn({
      teamId: input.teamId,
      userId: input.userId,
      columnId: columna.id,
      title: t.title.slice(0, 200),
      notes: t.notes?.slice(0, 20000),
      dueDate: t.dueDate ?? null,
    });
    if (!task) continue;
    taskIds.push(task.id);
    await insertRelation({
      teamId: input.teamId,
      userId: input.userId,
      sourceType: 'task',
      sourceId: task.id,
      targetType: 'contact',
      targetId: contact.id,
      relationType: 'related',
      metadata: { source: 'sales-ops:client_project' },
    });
  }
  return { workspaceId: workspace.id, projectId: project.id, created, taskIds };
}
