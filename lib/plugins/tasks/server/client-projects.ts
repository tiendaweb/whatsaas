import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomers,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
} from '@/lib/db/schema';

/**
 * El cliente de cada proyecto, y si su ficha se puede archivar.
 *
 * Vive acá y no dentro de la ruta porque ahora lo leen dos apps: Tareas OS
 * (`/api/plugins/tasks/client-projects`) y Empresa, que muestra el estado de
 * archivado junto a cada proyecto. Duplicar la derivación del cliente habría
 * dejado dos definiciones de "de quién es este proyecto", y el comentario
 * original ya advierte que esa lógica se rompió una vez.
 */

export type ClientProject = {
  projectId: number;
  customerId: number | null;
  customerStatus: string | null;
  totalTasks: number;
  openTasks: number;
  canArchive: boolean;
};

export function isClientsWorkspace(name: string) {
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
export async function getClientProjects(teamId: number): Promise<ClientProject[]> {
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

/**
 * Archiva la ficha del cliente dueño de un proyecto: es lo que lo saca del CRM.
 *
 * Las tres guardas son las que ya aplicaba Tareas OS y se conservan tal cual:
 * archivar sin cliente no tiene efecto, y archivar con trabajo abierto esconde
 * del CRM a alguien a quien todavía se le debe algo.
 */
export async function archiveClientProject(
  teamId: number,
  userId: number,
  projectId: number,
): Promise<
  | { ok: true; projectId: number; customerId: number }
  | { ok: false; status: number; error: string }
> {
  const projects = await getClientProjects(teamId);
  const project = projects.find((item) => item.projectId === projectId);
  if (!project) return { ok: false, status: 404, error: 'Proyecto de cliente no encontrado.' };
  if (!project.customerId) return { ok: false, status: 409, error: 'El proyecto no está vinculado a un cliente.' };
  if (!project.totalTasks) return { ok: false, status: 409, error: 'Un cliente sin tareas no se puede archivar desde Tareas.' };
  if (project.openTasks > 0) return { ok: false, status: 409, error: 'Completa todas las tareas antes de archivar el cliente.' };

  await db.update(teamCustomers)
    .set({ status: 'archived', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.id, project.customerId)));

  return { ok: true, projectId: project.projectId, customerId: project.customerId };
}
