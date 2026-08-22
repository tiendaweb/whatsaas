import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamNotes, teamTaskItems, teamTaskProjects, users, type NoteCommitment } from '@/lib/db/schema';
import { createTaskInColumn, getProjectFirstColumn, insertRelation } from '@/lib/plugins/tasks/server/task-os';

export type NoteCommitmentWithTaskStatus = NoteCommitment & {
  taskStatus?: string;
  taskCompletedAt?: string | null;
};

/**
 * Adjunta a cada compromiso ya vinculado a una tarea (`taskItemId`) el estado
 * real de esa tarea (`status`/`completedAt`), leído de `team_task_items`. No
 * persiste nada — es solo para que el cliente pueda pintar el checkbox sin
 * hacer un fetch aparte por cada compromiso. Los compromisos sin `taskItemId`
 * (todavía no guardados como tarea) quedan sin tocar.
 */
export async function attachCommitmentTaskStatus<T extends { commitments?: unknown }>(note: T | null): Promise<T | null> {
  if (!note) return note;
  const commitments = (note.commitments ?? []) as NoteCommitment[];
  const taskIds = [...new Set(commitments.map((c) => c.taskItemId).filter((id): id is number => Boolean(id)))];
  if (taskIds.length === 0) return note;

  const tasks = await db.query.teamTaskItems.findMany({
    where: inArray(teamTaskItems.id, taskIds),
    columns: { id: true, status: true, completedAt: true },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const enriched: NoteCommitmentWithTaskStatus[] = commitments.map((c) => {
    if (!c.taskItemId) return c;
    const task = byId.get(c.taskItemId);
    if (!task) return c;
    return { ...c, taskStatus: task.status, taskCompletedAt: task.completedAt ? task.completedAt.toISOString() : null };
  });

  return { ...note, commitments: enriched };
}

const MEETING_TASKS_PROJECT_NAME = 'Reuniones';

async function getOrCreateMeetingsProject(teamId: number, userId: number) {
  const existing = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.name, MEETING_TASKS_PROJECT_NAME)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(teamTaskProjects)
    .values({ teamId, name: MEETING_TASKS_PROJECT_NAME, createdBy: userId })
    .returning();
  return created;
}

/**
 * Crea una tarea (team_task_items) por cada compromiso de la nota que todavía no
 * tiene `taskItemId`, las vincula a la nota vía team_task_relations, y devuelve
 * la nota con los `commitments` actualizados (cada uno apuntando a su tarea).
 * Idempotente: si se llama dos veces, los commitments que ya tienen taskItemId
 * no generan tareas duplicadas.
 */
export async function generateTasksFromNoteCommitments(input: { teamId: number; userId: number; noteId: number }) {
  const note = await db.query.teamNotes.findFirst({
    where: and(eq(teamNotes.id, input.noteId), eq(teamNotes.teamId, input.teamId)),
  });
  if (!note) return null;

  const commitments = (note.commitments ?? []) as NoteCommitment[];
  const pending = commitments.filter((c) => !c.taskItemId && c.text?.trim());
  if (pending.length === 0) return note;

  const project = await getOrCreateMeetingsProject(input.teamId, input.userId);
  const column = await getProjectFirstColumn(input.teamId, project.id);

  const assigneeNames = new Map<number, string>();
  const assigneeIds = [...new Set(pending.map((c) => c.assigneeUserId).filter((id): id is number => Boolean(id)))];
  if (assigneeIds.length > 0) {
    const rows = await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.id, assigneeIds), columns: { id: true, name: true, email: true } });
    for (const row of rows) assigneeNames.set(row.id, row.name || row.email);
  }

  const updatedCommitments: NoteCommitment[] = [...commitments];

  for (const commitment of pending) {
    const responsable = commitment.assigneeUserId ? assigneeNames.get(commitment.assigneeUserId) : undefined;
    const task = await createTaskInColumn({
      teamId: input.teamId,
      userId: input.userId,
      columnId: column.id,
      title: commitment.text.trim(),
      notes: responsable ? `Responsable: ${responsable}\nGenerada desde nota de reunión #${note.id}.` : `Generada desde nota de reunión #${note.id}.`,
      dueDate: commitment.dueDate ?? null,
    });
    if (!task) continue;

    await insertRelation({
      teamId: input.teamId,
      userId: input.userId,
      sourceType: 'note',
      sourceId: note.id,
      targetType: 'task',
      targetId: task.id,
      relationType: 'generated_from',
    });

    const idx = updatedCommitments.findIndex((c) => c === commitment || (c.text === commitment.text && !c.taskItemId));
    if (idx >= 0) updatedCommitments[idx] = { ...updatedCommitments[idx], taskItemId: task.id };
  }

  const [updatedNote] = await db
    .update(teamNotes)
    .set({ commitments: updatedCommitments, updatedBy: input.userId, updatedAt: new Date() })
    .where(and(eq(teamNotes.id, note.id), eq(teamNotes.teamId, input.teamId)))
    .returning();

  return updatedNote;
}

/**
 * Se llama después de crear/actualizar una nota. Si es una nota de reunión
 * (`eventId` seteado) y tiene compromisos sin `taskItemId`, los convierte en
 * tareas reales al toque — ya no hace falta el paso manual "Generar tareas".
 * Idempotente (delega en `generateTasksFromNoteCommitments`): si no hay nada
 * pendiente, devuelve la nota tal cual.
 */
export async function syncNoteCommitmentsToTasks<T extends { id: number; eventId?: number | null; commitments?: unknown }>(
  note: T,
  ctx: { teamId: number; userId: number },
): Promise<T> {
  const commitments = (note.commitments ?? []) as NoteCommitment[];
  const hasPending = Boolean(note.eventId) && commitments.some((c) => !c.taskItemId && c.text?.trim());
  if (!hasPending) return note;

  const regenerated = await generateTasksFromNoteCommitments({ teamId: ctx.teamId, userId: ctx.userId, noteId: note.id });
  return (regenerated as T | null) ?? note;
}

/** Igual que `attachCommitmentTaskStatus` pero para una lista, con una sola query. */
export async function attachCommitmentTaskStatusBulk<T extends { commitments?: unknown }>(notes: T[]): Promise<T[]> {
  const allTaskIds = new Set<number>();
  for (const note of notes) {
    const commitments = (note.commitments ?? []) as NoteCommitment[];
    for (const c of commitments) if (c.taskItemId) allTaskIds.add(c.taskItemId);
  }
  if (allTaskIds.size === 0) return notes;

  const tasks = await db.query.teamTaskItems.findMany({
    where: inArray(teamTaskItems.id, [...allTaskIds]),
    columns: { id: true, status: true, completedAt: true },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return notes.map((note) => {
    const commitments = (note.commitments ?? []) as NoteCommitment[];
    if (!commitments.some((c) => c.taskItemId)) return note;
    const enriched: NoteCommitmentWithTaskStatus[] = commitments.map((c) => {
      if (!c.taskItemId) return c;
      const task = byId.get(c.taskItemId);
      if (!task) return c;
      return { ...c, taskStatus: task.status, taskCompletedAt: task.completedAt ? task.completedAt.toISOString() : null };
    });
    return { ...note, commitments: enriched };
  });
}
