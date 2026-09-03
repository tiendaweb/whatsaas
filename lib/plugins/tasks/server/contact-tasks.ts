import { and, asc, eq, inArray, or } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  messages,
  teamTaskColumns,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
} from '@/lib/db/schema';
import { pusherServer } from '@/lib/pusher-server';
import { ensureDefaultTaskWorkspace } from '@/lib/plugins/tasks/server/workspaces';
import {
  assertContact,
  createTaskInColumn,
  getProjectFirstColumn,
  insertRelation,
  patchTaskItem,
} from '@/lib/plugins/tasks/server/task-os';

const CONTACT_TASK_PROJECT_NAME = 'Contactos';

async function ensureContactTaskProject(teamId: number, userId: number) {
  const existing = await db.query.teamTaskProjects.findFirst({
    where: and(
      eq(teamTaskProjects.teamId, teamId),
      eq(teamTaskProjects.name, CONTACT_TASK_PROJECT_NAME),
    ),
    orderBy: (table, { asc: orderAsc }) => [orderAsc(table.createdAt)],
  });
  if (existing) return existing;

  const workspace = await ensureDefaultTaskWorkspace(teamId, userId);
  const [project] = await db
    .insert(teamTaskProjects)
    .values({
      teamId,
      workspaceId: workspace.id,
      name: CONTACT_TASK_PROJECT_NAME,
      order: 0,
      createdBy: userId,
    })
    .returning();
  return project;
}

export async function listContactTasks(teamId: number, contactId: number) {
  const relations = await db.query.teamTaskRelations.findMany({
    where: and(
      eq(teamTaskRelations.teamId, teamId),
      or(
        and(
          eq(teamTaskRelations.sourceType, 'task'),
          eq(teamTaskRelations.targetType, 'contact'),
          eq(teamTaskRelations.targetId, contactId),
        ),
        and(
          eq(teamTaskRelations.sourceType, 'contact'),
          eq(teamTaskRelations.sourceId, contactId),
          eq(teamTaskRelations.targetType, 'task'),
        ),
      ),
    ),
    columns: {
      sourceType: true,
      sourceId: true,
      targetId: true,
    },
  });

  const taskIds = Array.from(
    new Set(
      relations.map((relation) =>
        relation.sourceType === 'task' ? relation.sourceId : relation.targetId,
      ),
    ),
  );
  if (!taskIds.length) return [];

  const rows = await db
    .select({
      id: teamTaskItems.id,
      title: teamTaskItems.title,
      notes: teamTaskItems.notes,
      status: teamTaskItems.status,
      aiPrompt: teamTaskItems.aiPrompt,
      aiNextStep: teamTaskItems.aiNextStep,
      aiContextQuestion: teamTaskItems.aiContextQuestion,
      aiContextAnswer: teamTaskItems.aiContextAnswer,
      aiReadyAt: teamTaskItems.aiReadyAt,
      dueDate: teamTaskItems.dueDate,
      createdAt: teamTaskItems.createdAt,
      updatedAt: teamTaskItems.updatedAt,
      projectId: teamTaskItems.projectId,
      projectName: teamTaskProjects.name,
      columnId: teamTaskItems.columnId,
      columnName: teamTaskColumns.title,
    })
    .from(teamTaskItems)
    .innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItems.projectId))
    .innerJoin(teamTaskColumns, eq(teamTaskColumns.id, teamTaskItems.columnId))
    .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.id, taskIds)))
    .orderBy(asc(teamTaskItems.createdAt), asc(teamTaskItems.id));

  return rows;
}

export async function createContactTask(input: {
  teamId: number;
  userId: number;
  contactId: number;
  title: string;
  notes?: string;
  dueDate?: string | null;
  status?: 'open' | 'in_progress' | 'done';
}) {
  const contact = await assertContact(input.teamId, input.contactId);
  if (!contact) return { error: 'contact_not_found' as const };

  const project = await ensureContactTaskProject(input.teamId, input.userId);
  const column = await getProjectFirstColumn(input.teamId, project.id);
  const task = await createTaskInColumn({
    teamId: input.teamId,
    userId: input.userId,
    columnId: column.id,
    title: input.title,
    notes: input.notes,
    dueDate: input.dueDate,
    status: input.status,
  });
  if (!task) return { error: 'task_not_created' as const };

  await insertRelation({
    teamId: input.teamId,
    userId: input.userId,
    sourceType: 'task',
    sourceId: task.id,
    targetType: 'contact',
    targetId: input.contactId,
    relationType: 'related',
    metadata: { source: 'chat' },
  });

  if (contact.chat?.id) {
    const timestamp = task.createdAt ?? new Date();
    const [taskMessage] = await db
      .insert(messages)
      .values({
        id: `task_${task.id}_contact_${input.contactId}`,
        chatId: contact.chat.id,
        fromMe: true,
        messageType: 'task',
        text: task.title,
        timestamp,
        status: 'read',
        isInternal: true,
        quotedMessageText: JSON.stringify({ taskId: task.id, status: task.status }),
      })
      .onConflictDoNothing()
      .returning();

    if (taskMessage) {
      try {
        await pusherServer.trigger(`team-${input.teamId}`, 'new-message', {
          ...taskMessage,
          timestamp: timestamp.toISOString(),
          remoteJid: contact.chat.remoteJid,
          instanceId: contact.chat.instanceId,
        });
      } catch (error) {
        console.error('Could not broadcast contact task message:', error);
      }
    }
  }

  return { task };
}

/** La tarea tiene que estar realmente colgada de ESTE contacto. */
async function assertContactTaskRelation(teamId: number, contactId: number, taskId: number) {
  const relation = await db.query.teamTaskRelations.findFirst({
    where: and(
      eq(teamTaskRelations.teamId, teamId),
      or(
        and(
          eq(teamTaskRelations.sourceType, 'task'),
          eq(teamTaskRelations.sourceId, taskId),
          eq(teamTaskRelations.targetType, 'contact'),
          eq(teamTaskRelations.targetId, contactId),
        ),
        and(
          eq(teamTaskRelations.sourceType, 'contact'),
          eq(teamTaskRelations.sourceId, contactId),
          eq(teamTaskRelations.targetType, 'task'),
          eq(teamTaskRelations.targetId, taskId),
        ),
      ),
    ),
    columns: { id: true },
  });
  return Boolean(relation);
}

export async function updateContactTaskStatus(input: {
  teamId: number;
  contactId: number;
  taskId: number;
  status: 'open' | 'in_progress' | 'done';
}) {
  const ok = await assertContactTaskRelation(input.teamId, input.contactId, input.taskId);
  if (!ok) return { error: 'not_found' as const };

  return patchTaskItem({
    teamId: input.teamId,
    taskId: input.taskId,
    patch: { status: input.status },
  });
}

/**
 * Los campos de IA de una tarea, editables desde el panel del chat.
 *
 * `aiReady` es el mismo interruptor que el botón de Tareas: con true la tarea
 * entra en la cola que lee `whatspro_tasks_ai_worklist`; con false vuelve a la
 * lista. Sin próximo paso ni prompt no hay nada que ejecutar, así que encolar
 * en ese estado se rechaza acá y no en la UI.
 */
export async function updateContactTaskAi(input: {
  teamId: number;
  contactId: number;
  taskId: number;
  aiReady?: boolean;
  aiPrompt?: string;
  aiNextStep?: string;
  aiContextAnswer?: string;
}) {
  const ok = await assertContactTaskRelation(input.teamId, input.contactId, input.taskId);
  if (!ok) return { error: 'not_found' as const };

  const current = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, input.taskId), eq(teamTaskItems.teamId, input.teamId)),
    columns: { aiPrompt: true, aiNextStep: true, aiContextQuestion: true, aiContextAnswer: true },
  });
  if (!current) return { error: 'not_found' as const };

  if (input.aiReady === true) {
    const tienePrompt = [
      input.aiPrompt ?? current.aiPrompt,
      input.aiNextStep ?? current.aiNextStep,
      current.aiContextQuestion,
      input.aiContextAnswer ?? current.aiContextAnswer,
    ].some((value) => (value ?? '').trim().length > 0);
    if (!tienePrompt) return { error: 'prompt_required' as const };
  }

  return patchTaskItem({
    teamId: input.teamId,
    taskId: input.taskId,
    patch: {
      ...(input.aiPrompt !== undefined ? { aiPrompt: input.aiPrompt } : {}),
      ...(input.aiNextStep !== undefined ? { aiNextStep: input.aiNextStep } : {}),
      ...(input.aiContextAnswer !== undefined ? { aiContextAnswer: input.aiContextAnswer } : {}),
      ...(input.aiReady !== undefined ? { aiReadyAt: input.aiReady ? new Date().toISOString() : null } : {}),
    },
  });
}
