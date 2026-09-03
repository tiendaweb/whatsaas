import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, teamTaskProjects, teamTaskWorkspaces } from '@/lib/db/schema';
import { createColumnInProject, createTaskInColumn, getProjectFirstColumn, insertRelation } from '@/lib/plugins/tasks/server/task-os';
import { createContactTask } from '@/lib/plugins/tasks/server/contact-tasks';
import { getEvent, updateEvent } from './events';

/**
 * Lo que sale de una reunión.
 *
 * Una reunión sin próxima acción es una reunión que se pierde: al cerrar la
 * nota se puede mandar esa acción a Tareas OS con un clic. Si el evento tiene
 * contacto, la tarea queda vinculada a él (y aparece en su ficha del Command
 * Center); si no, va a un proyecto "Reuniones" del espacio de siempre.
 */
const PROYECTO_REUNIONES = 'Reuniones';

async function proyectoDeReuniones(teamId: number, userId: number) {
  const workspace =
    (await db.query.teamTaskWorkspaces.findFirst({ where: and(eq(teamTaskWorkspaces.teamId, teamId), eq(teamTaskWorkspaces.name, 'Command Center')) })) ??
    (await db.query.teamTaskWorkspaces.findFirst({ where: eq(teamTaskWorkspaces.teamId, teamId), orderBy: (t, { asc }) => [asc(t.order), asc(t.id)] }));
  if (!workspace) throw new Error('El equipo no tiene espacios en Tareas OS.');
  let project = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, workspace.id), eq(teamTaskProjects.name, PROYECTO_REUNIONES)),
  });
  if (!project) {
    [project] = await db.insert(teamTaskProjects).values({ teamId, workspaceId: workspace.id, name: PROYECTO_REUNIONES, order: 1, icon: 'calendar-days', createdBy: userId }).returning();
    for (const title of ['Por hacer', 'En curso', 'Hecho']) await createColumnInProject({ teamId, projectId: project.id, title });
  }
  return project;
}

export async function crearTareaDesdeEvento(
  teamId: number,
  userId: number,
  eventId: number,
  input: { title?: string; notes?: string; dueDate?: string | null },
): Promise<{ taskId: number; projectId: number | null }> {
  const evento = await getEvent(teamId, eventId);
  if (!evento) throw new Error('Evento no encontrado.');
  const titulo = (input.title?.trim() || evento.nextAction.trim() || `Seguir: ${evento.title}`).slice(0, 200);
  const notas = [input.notes?.trim() || evento.outcome.trim() || evento.notes.trim(), `Viene de la reunión «${evento.title}» del ${new Date(evento.startsAt).toLocaleDateString('es-AR')}`]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 20000);

  if (evento.contactId) {
    const creada = await createContactTask({ teamId, userId, contactId: evento.contactId, title: titulo, notes: notas, dueDate: input.dueDate ?? null });
    if ('error' in creada) throw new Error(creada.error);
    return { taskId: creada.task.id, projectId: null };
  }

  const project = await proyectoDeReuniones(teamId, userId);
  const column = await getProjectFirstColumn(teamId, project.id);
  const task = await createTaskInColumn({ teamId, userId, columnId: column.id, title: titulo, notes: notas, dueDate: input.dueDate ?? null });
  if (!task) throw new Error('No se pudo crear la tarea.');
  return { taskId: task.id, projectId: project.id };
}

/** Cierra la reunión: guarda lo que pasó y la marca hecha. */
export async function cerrarReunion(teamId: number, userId: number, eventId: number, input: { outcome?: string; nextAction?: string; notes?: string; status?: 'completed' | 'canceled' }) {
  const evento = await updateEvent(teamId, userId, eventId, {
    outcome: input.outcome,
    nextAction: input.nextAction,
    notes: input.notes,
    status: input.status ?? 'completed',
  });
  if (!evento) throw new Error('Evento no encontrado.');
  return evento;
}

/** Contactos para vincular, por nombre. */
export async function buscarContactos(teamId: number, q: string) {
  const filtro = `%${q.trim()}%`;
  const rows = await db.query.contacts.findMany({
    where: and(eq(contacts.teamId, teamId)),
    columns: { id: true, name: true, chatId: true },
    limit: 200,
  });
  const texto = q.trim().toLowerCase();
  return rows.filter((r) => !texto || (r.name ?? '').toLowerCase().includes(texto)).slice(0, 20);
}
