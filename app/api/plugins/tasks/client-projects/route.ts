import { NextResponse } from 'next/server';
import { and, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomers,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
} from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const archiveSchema = z.object({ projectId: z.number().int().positive() });

function isClientsWorkspace(name: string) {
  return name.trim().toLocaleLowerCase('es') === 'clientes';
}

/**
 * Cliente de cada proyecto.
 *
 * Antes esto leía únicamente relaciones `project↔customer`, que NINGÚN punto
 * del producto escribe — así que devolvía `customerId: null` siempre y dejaba
 * mudas cuatro funciones de la interfaz (ficha del cliente, archivar cliente,
 * "filtrar tareas del cliente" y el PATCH de archivado). Ahora:
 *
 *  1. usa la relación `project↔customer` si existe (sigue siendo la más
 *     específica, y algún día puede tener escritor);
 *  2. si no, DERIVA el cliente de las relaciones `task↔customer` de las
 *     tareas del proyecto — que es donde el vínculo sí vive hoy. Si hay
 *     varios clientes en un mismo proyecto gana el que más tareas tenga.
 *
 * Además ya no exige un workspace llamado "Clientes": ese nombre no lo crea
 * nadie en el código, así que en la mayoría de las instalaciones cortaba la
 * función de entrada. Si existe, acota a él; si no, mira todos los proyectos.
 */
async function getClientProjects(teamId: number) {
  const workspaces = await db.select().from(teamTaskWorkspaces).where(eq(teamTaskWorkspaces.teamId, teamId));
  const clientsWorkspace = workspaces.find((workspace) => isClientsWorkspace(workspace.name));

  const projects = await db.select({ id: teamTaskProjects.id })
    .from(teamTaskProjects)
    .where(clientsWorkspace
      ? and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, clientsWorkspace.id))
      : eq(teamTaskProjects.teamId, teamId));
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) return [];

  const tasks = await db.select({ id: teamTaskItems.id, projectId: teamTaskItems.projectId, status: teamTaskItems.status })
    .from(teamTaskItems)
    .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.projectId, projectIds)));
  const taskIds = tasks.map((task) => task.id);

  const [projectRelations, taskRelations, customers] = await Promise.all([
    db.select().from(teamTaskRelations).where(and(
      eq(teamTaskRelations.teamId, teamId),
      or(
        and(eq(teamTaskRelations.sourceType, 'project'), inArray(teamTaskRelations.sourceId, projectIds), eq(teamTaskRelations.targetType, 'customer')),
        and(eq(teamTaskRelations.targetType, 'project'), inArray(teamTaskRelations.targetId, projectIds), eq(teamTaskRelations.sourceType, 'customer')),
      ),
    )),
    taskIds.length
      ? db.select().from(teamTaskRelations).where(and(
          eq(teamTaskRelations.teamId, teamId),
          or(
            and(eq(teamTaskRelations.sourceType, 'task'), inArray(teamTaskRelations.sourceId, taskIds), eq(teamTaskRelations.targetType, 'customer')),
            and(eq(teamTaskRelations.targetType, 'task'), inArray(teamTaskRelations.targetId, taskIds), eq(teamTaskRelations.sourceType, 'customer')),
          ),
        ))
      : Promise.resolve([]),
    db.select({ id: teamCustomers.id, status: teamCustomers.status })
      .from(teamCustomers)
      .where(eq(teamCustomers.teamId, teamId)),
  ]);

  const customerStatus = new Map(customers.map((customer) => [customer.id, customer.status]));

  const explicitByProject = new Map<number, number>();
  for (const relation of projectRelations) {
    const projectId = relation.sourceType === 'project' ? relation.sourceId : relation.targetId;
    const customerId = relation.sourceType === 'customer' ? relation.sourceId : relation.targetId;
    if (!explicitByProject.has(projectId)) explicitByProject.set(projectId, customerId);
  }

  // Derivado: cuántas tareas de cada proyecto apuntan a cada cliente.
  const projectByTask = new Map(tasks.map((task) => [task.id, task.projectId]));
  const votesByProject = new Map<number, Map<number, number>>();
  for (const relation of taskRelations) {
    const taskId = relation.sourceType === 'task' ? relation.sourceId : relation.targetId;
    const customerId = relation.sourceType === 'customer' ? relation.sourceId : relation.targetId;
    const projectId = projectByTask.get(taskId);
    if (!projectId) continue;
    const votes = votesByProject.get(projectId) ?? new Map<number, number>();
    votes.set(customerId, (votes.get(customerId) ?? 0) + 1);
    votesByProject.set(projectId, votes);
  }

  return projectIds.map((projectId) => {
    const projectTasks = tasks.filter((task) => task.projectId === projectId);
    const votes = votesByProject.get(projectId);
    const derivedCustomerId = votes
      ? [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
      : null;
    const customerId = explicitByProject.get(projectId) ?? derivedCustomerId;
    const openTasks = projectTasks.filter((task) => task.status !== 'done').length;
    return {
      projectId,
      customerId,
      customerStatus: customerId ? customerStatus.get(customerId) ?? null : null,
      totalTasks: projectTasks.length,
      openTasks,
      canArchive: Boolean(customerId && projectTasks.length > 0 && openTasks === 0),
    };
  }).filter((entry) => entry.customerId !== null || Boolean(clientsWorkspace));
}

export async function GET() {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await getClientProjects(ctx.team.id));
}

export async function PATCH(request: Request) {
  const ctx = await getPluginRequestContext('customersWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const projects = await getClientProjects(ctx.team.id);
  const project = projects.find((item) => item.projectId === parsed.data.projectId);
  if (!project) return NextResponse.json({ error: 'Proyecto de cliente no encontrado.' }, { status: 404 });
  if (!project.customerId) return NextResponse.json({ error: 'El proyecto no está vinculado a un cliente.' }, { status: 409 });
  if (!project.totalTasks) return NextResponse.json({ error: 'Un cliente sin tareas no se puede archivar desde Tareas.' }, { status: 409 });
  if (project.openTasks > 0) return NextResponse.json({ error: 'Completa todas las tareas antes de archivar el cliente.' }, { status: 409 });

  await db.update(teamCustomers)
    .set({ status: 'archived', updatedBy: ctx.user.id, updatedAt: new Date() })
    .where(and(eq(teamCustomers.teamId, ctx.team.id), eq(teamCustomers.id, project.customerId)));

  return NextResponse.json({ ok: true, projectId: project.projectId, customerId: project.customerId });
}
