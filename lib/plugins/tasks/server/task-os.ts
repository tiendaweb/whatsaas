import { and, count, eq, inArray, like, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  teamCustomers,
  teamCustomerTransactions,
  teamDocumentFolders,
  teamDocuments,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
  teamSales,
  messages,
  teamTaskColumns,
  teamTaskComments,
  teamTaskDependencies,
  teamTaskItemLocations,
  teamTaskItems,
  teamTaskMedia,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskTemplates,
  teamTaskWorkspaces,
  type TaskChecklistItem,
  type TaskLabel,
} from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import { pusherServer } from '@/lib/pusher-server';
import { esWorkKind, esWorkStatus, type WorkKind, type WorkStatus } from '../shared/produccion';

/**
 * Con qué se puede vincular una tarea.
 *
 * `sale`, `transaction`, `subscription` y `company` se sumaron para que una
 * tarea pueda colgar de la venta, el comprobante, la membresía o la empresa a
 * la que responde — antes sólo llegaba hasta el cliente, y el vínculo con lo
 * que de verdad la originó había que anotarlo a mano en las notas.
 */
export type TaskEntityType =
  | 'workspace' | 'project' | 'task' | 'contact' | 'customer' | 'document' | 'document_folder'
  | 'sale' | 'transaction' | 'subscription' | 'company'
  | 'note' | 'event';

export async function ensureTaskLocations(teamId: number) {
  const items = await db.query.teamTaskItems.findMany({
    where: eq(teamTaskItems.teamId, teamId),
    columns: { id: true, teamId: true, projectId: true, columnId: true, order: true },
  });

  if (!items.length) return;

  await db
    .insert(teamTaskItemLocations)
    .values(
      items.map((item) => ({
        taskId: item.id,
        teamId: item.teamId,
        projectId: item.projectId,
        columnId: item.columnId,
        order: item.order,
        isPrimary: true,
      })),
    )
    .onConflictDoNothing();
}

export async function loadTaskOsData(teamId: number) {
  await ensureTaskLocations(teamId);

  const workspaces = await db.query.teamTaskWorkspaces.findMany({
    where: eq(teamTaskWorkspaces.teamId, teamId),
    orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
  });

  const projects = await db.query.teamTaskProjects.findMany({
    where: eq(teamTaskProjects.teamId, teamId),
    orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
  });

  const projectIds = projects.map((project) => project.id);
  const columns = projectIds.length
    ? await db.query.teamTaskColumns.findMany({
        where: inArray(teamTaskColumns.projectId, projectIds),
        orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
      })
    : [];

  const locations = projectIds.length
    ? await db.query.teamTaskItemLocations.findMany({
        where: and(eq(teamTaskItemLocations.teamId, teamId), inArray(teamTaskItemLocations.projectId, projectIds)),
        orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
      })
    : [];

  const taskIds = Array.from(new Set(locations.map((location) => location.taskId)));
  const items = taskIds.length
    ? await db.query.teamTaskItems.findMany({
        where: and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.id, taskIds)),
      })
    : [];

  const itemIds = items.map((item) => item.id);
  const commentCounts: Record<number, number> = {};
  if (itemIds.length) {
    const rows = await db
      .select({ taskId: teamTaskComments.taskId, cnt: count() })
      .from(teamTaskComments)
      .where(inArray(teamTaskComments.taskId, itemIds))
      .groupBy(teamTaskComments.taskId);
    for (const row of rows) commentCounts[row.taskId] = Number(row.cnt);
  }

  const itemMap = new Map(items.map((item) => [item.id, item]));

  // Attach cover media (id + resolved url) for tasks that have one
  const coverMediaIds = items.map((it) => it.coverMediaId).filter((id): id is number => id != null);
  const coverMediaRows = coverMediaIds.length
    ? await db.query.teamTaskMedia.findMany({
        where: inArray(teamTaskMedia.id, coverMediaIds),
      })
    : [];
  const coverUrlById = new Map(coverMediaRows.map((m) => [m.id, resolveMediaUrl(m.url)]));
  const coverUrlByTask: Record<number, string | null> = {};
  for (const item of items) {
    if (item.coverMediaId && coverUrlById.has(item.coverMediaId)) {
      coverUrlByTask[item.id] = coverUrlById.get(item.coverMediaId) ?? null;
    }
  }

  return workspaces.map((workspace) => ({
    ...workspace,
    projects: projects
      .filter((project) => project.workspaceId === workspace.id)
      .map((project) => ({
        ...project,
        columns: columns
          .filter((column) => column.projectId === project.id)
          .map((column) => ({
            ...column,
            items: locations
              .filter((location) => location.projectId === project.id && location.columnId === column.id)
              .map((location) => {
                const item = itemMap.get(location.taskId);
                if (!item) return null;
                return {
                  ...item,
                  projectId: location.projectId,
                  columnId: location.columnId,
                  order: location.order,
                  locationId: location.id,
                  isPrimaryLocation: location.isPrimary,
                  primaryProjectId: item.projectId,
                  primaryColumnId: item.columnId,
                  commentCount: commentCounts[item.id] ?? 0,
                  coverMediaId: item.coverMediaId ?? null,
                  coverUrl: coverUrlByTask[item.id] ?? null,
                };
              })
              .filter((row): row is NonNullable<typeof row> => row != null),
          })),
      })),
  }));
}

export async function assertTask(teamId: number, taskId: number) {
  return db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)),
  });
}

export async function assertProject(teamId: number, projectId: number) {
  return db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.id, projectId), eq(teamTaskProjects.teamId, teamId)),
  });
}

export async function assertWorkspace(teamId: number, workspaceId: number) {
  return db.query.teamTaskWorkspaces.findFirst({
    where: and(eq(teamTaskWorkspaces.id, workspaceId), eq(teamTaskWorkspaces.teamId, teamId)),
  });
}

export async function assertContact(teamId: number, contactId: number) {
  return db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)),
    with: {
      chat: {
        columns: { id: true, remoteJid: true, profilePicUrl: true, instanceId: true },
      },
    },
  });
}

export async function assertCustomer(teamId: number, customerId: number) {
  return db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
    columns: { id: true },
  });
}

export async function assertDocument(teamId: number, documentId: number) {
  return db.query.teamDocuments.findFirst({
    where: and(eq(teamDocuments.id, documentId), eq(teamDocuments.teamId, teamId)),
    columns: { id: true, title: true, emoji: true },
  });
}

export async function assertSale(teamId: number, saleId: number) {
  return db.query.teamSales.findFirst({
    where: and(eq(teamSales.id, saleId), eq(teamSales.teamId, teamId)),
    columns: { id: true },
  });
}

export async function assertTransaction(teamId: number, transactionId: number) {
  return db.query.teamCustomerTransactions.findFirst({
    where: and(eq(teamCustomerTransactions.id, transactionId), eq(teamCustomerTransactions.teamId, teamId)),
    columns: { id: true },
  });
}

export async function assertSubscription(teamId: number, subscriptionId: number) {
  return db.query.teamMembershipSubscriptions.findFirst({
    where: and(eq(teamMembershipSubscriptions.id, subscriptionId), eq(teamMembershipSubscriptions.teamId, teamId)),
    columns: { id: true },
  });
}

export async function assertCompany(teamId: number, companyId: number) {
  return db.query.teamMembershipCompanies.findFirst({
    where: and(eq(teamMembershipCompanies.id, companyId), eq(teamMembershipCompanies.teamId, teamId)),
    columns: { id: true },
  });
}

/** Vincular la CARPETA permite que sus documentos hereden el cliente. */
export async function assertDocumentFolder(teamId: number, folderId: number) {
  return db.query.teamDocumentFolders.findFirst({
    where: and(eq(teamDocumentFolders.id, folderId), eq(teamDocumentFolders.teamId, teamId)),
    columns: { id: true, name: true },
  });
}

export async function assertEntity(teamId: number, type: TaskEntityType, id: number) {
  if (type === 'task') return Boolean(await assertTask(teamId, id));
  if (type === 'project') return Boolean(await assertProject(teamId, id));
  if (type === 'workspace') return Boolean(await assertWorkspace(teamId, id));
  if (type === 'contact') return Boolean(await assertContact(teamId, id));
  if (type === 'customer') return Boolean(await assertCustomer(teamId, id));
  if (type === 'document') return Boolean(await assertDocument(teamId, id));
  if (type === 'sale') return Boolean(await assertSale(teamId, id));
  if (type === 'transaction') return Boolean(await assertTransaction(teamId, id));
  if (type === 'subscription') return Boolean(await assertSubscription(teamId, id));
  if (type === 'company') return Boolean(await assertCompany(teamId, id));
  if (type === 'document_folder') return Boolean(await assertDocumentFolder(teamId, id));
  // `note` y `event` siguen sin validador: los acepta el tipo (hay filas
  // históricas creadas por meeting-notes) pero ninguna ruta puede crearlos.
  return false;
}

export async function getProjectFirstColumn(teamId: number, projectId: number) {
  const column = await db.query.teamTaskColumns.findFirst({
    where: and(eq(teamTaskColumns.teamId, teamId), eq(teamTaskColumns.projectId, projectId)),
    orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
  });
  if (column) return column;

  const [created] = await db.insert(teamTaskColumns).values({
    teamId,
    projectId,
    title: 'Por hacer',
    order: 0,
  }).returning();
  return created;
}

export async function nextTaskOrder(teamId: number, columnId: number) {
  const existing = await db.query.teamTaskItemLocations.findMany({
    where: and(eq(teamTaskItemLocations.teamId, teamId), eq(teamTaskItemLocations.columnId, columnId)),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });
  return existing.length ? existing[0].order + 1 : 0;
}

export async function createTaskLocation(input: {
  taskId: number;
  teamId: number;
  projectId: number;
  columnId: number;
  order: number;
  isPrimary?: boolean;
}) {
  const [location] = await db
    .insert(teamTaskItemLocations)
    .values({
      taskId: input.taskId,
      teamId: input.teamId,
      projectId: input.projectId,
      columnId: input.columnId,
      order: input.order,
      isPrimary: input.isPrimary ?? false,
    })
    .onConflictDoUpdate({
      target: [teamTaskItemLocations.taskId, teamTaskItemLocations.projectId],
      set: {
        columnId: input.columnId,
        order: input.order,
        isPrimary: input.isPrimary ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();

  return location;
}

export async function createTaskInColumn(input: {
  teamId: number;
  userId?: number | null;
  columnId: number;
  title: string;
  notes?: string;
  aiPrompt?: string;
  aiNextStep?: string;
  aiContextQuestion?: string;
  aiContextAnswer?: string;
  aiReadyAt?: string | null;
  labelIds?: string[];
  checklist?: TaskChecklistItem[];
  dueDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  parentTaskId?: number | null;
  status?: string;
  color?: string | null;
  icon?: string | null;
  coverMediaId?: number | null;
  assigneeId?: number | null;
  workKind?: WorkKind | null;
  workStatus?: WorkStatus | null;
  requestedBy?: number | null;
  deliveryUrl?: string | null;
  blockedReason?: string | null;
}) {
  const column = await db.query.teamTaskColumns.findFirst({
    where: and(eq(teamTaskColumns.id, input.columnId), eq(teamTaskColumns.teamId, input.teamId)),
  });
  if (!column) return null;

  const order = await nextTaskOrder(input.teamId, column.id);

  const [item] = await db.insert(teamTaskItems).values({
    columnId: column.id,
    projectId: column.projectId,
    teamId: input.teamId,
    title: input.title.trim(),
    notes: input.notes ?? '',
    aiPrompt: String(input.aiPrompt ?? '').slice(0, 20000),
    aiNextStep: String(input.aiNextStep ?? '').slice(0, 20000),
    aiContextQuestion: String(input.aiContextQuestion ?? '').slice(0, 20000),
    aiContextAnswer: String(input.aiContextAnswer ?? '').slice(0, 20000),
    aiReadyAt: input.aiReadyAt ? new Date(input.aiReadyAt) : null,
    labelIds: input.labelIds ?? [],
    checklist: input.checklist ?? [],
    status: input.status ?? 'open',
    completedAt: input.status === 'done' ? new Date() : null,
    parentTaskId: input.parentTaskId ?? null,
    order,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    startDate: input.startDate ? new Date(input.startDate) : null,
    endDate: input.endDate ? new Date(input.endDate) : null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    coverMediaId: input.coverMediaId ?? null,
    createdBy: input.userId ?? null,
    assigneeId: input.assigneeId ?? null,
    workKind: input.workKind ?? null,
    workStatus: input.workStatus ?? null,
    requestedBy: input.requestedBy ?? null,
    deliveryUrl: input.deliveryUrl ?? null,
    blockedReason: input.blockedReason ?? null,
  }).returning();

  await createTaskLocation({
    taskId: item.id,
    teamId: input.teamId,
    projectId: column.projectId,
    columnId: column.id,
    order,
    isPrimary: true,
  });

  return item;
}

export type TaskPatchInput = Partial<{
  title: string;
  notes: string;
  aiPrompt: string;
  aiNextStep: string;
  aiContextQuestion: string;
  aiContextAnswer: string;
  aiReadyAt: string | null;
  labelIds: string[];
  checklist: TaskChecklistItem[];
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  columnId: number;
  order: number;
  makePrimary: boolean;
  status: string;
  parentTaskId: number | null;
  projectId: number;
  color: string | null;
  icon: string | null;
  coverMediaId: number | null;
  assigneeId: number | null;
}>;

/**
 * Applies a partial update to a task. When `columnId` changes it also moves the task's
 * location row (the source of truth for board position). Team-bound.
 */
export async function patchTaskItem(input: { teamId: number; taskId: number; patch: TaskPatchInput }) {
  const { teamId, taskId, patch } = input;

  const current = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)),
  });
  if (!current) return { error: 'not_found' as const };

  let nextProjectId: number | undefined;
  let nextColumnId: number | undefined;
  let nextOrder: number | undefined;
  let nextPrimaryProjectId: number | undefined;
  let nextPrimaryColumnId: number | undefined;
  let nextPrimaryOrder: number | undefined;
  if (patch.columnId !== undefined) {
    const column = await db.query.teamTaskColumns.findFirst({
      where: and(eq(teamTaskColumns.id, Number(patch.columnId)), eq(teamTaskColumns.teamId, teamId)),
    });
    if (!column) return { error: 'column_not_found' as const };
    if (patch.projectId !== undefined && Number(patch.projectId) !== column.projectId) {
      return { error: 'column_project_mismatch' as const };
    }

    nextProjectId = column.projectId;
    nextColumnId = column.id;
    const moved = current.projectId !== nextProjectId || current.columnId !== nextColumnId;
    nextOrder = patch.order !== undefined
      ? Number(patch.order)
      : moved
        ? await nextTaskOrder(teamId, nextColumnId)
        : current.order;

    const targetLocation = await db.query.teamTaskItemLocations.findFirst({
      where: and(
        eq(teamTaskItemLocations.taskId, current.id),
        eq(teamTaskItemLocations.projectId, nextProjectId),
        eq(teamTaskItemLocations.teamId, teamId),
      ),
      columns: { id: true, isPrimary: true },
    });
    const makePrimary = patch.makePrimary === true || current.projectId === nextProjectId || targetLocation?.isPrimary === true;

    if (makePrimary) {
      await db
        .update(teamTaskItemLocations)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(teamTaskItemLocations.taskId, current.id), eq(teamTaskItemLocations.teamId, teamId)));
    }

    if (makePrimary && current.projectId !== nextProjectId) {
      await db
        .delete(teamTaskItemLocations)
        .where(and(
          eq(teamTaskItemLocations.taskId, current.id),
          eq(teamTaskItemLocations.teamId, teamId),
          eq(teamTaskItemLocations.projectId, current.projectId),
        ));
    }

    await createTaskLocation({
      taskId: current.id,
      teamId,
      projectId: nextProjectId,
      columnId: nextColumnId,
      order: nextOrder,
      isPrimary: makePrimary,
    });

    if (makePrimary) {
      nextPrimaryProjectId = nextProjectId;
      nextPrimaryColumnId = nextColumnId;
      nextPrimaryOrder = nextOrder;
    }
  }

  const nextStatus =
    patch.status !== undefined
      ? String(patch.status)
      : patch.checklist !== undefined &&
          Array.isArray(patch.checklist) &&
          patch.checklist.length > 0 &&
          patch.checklist.every((item) => item.completed)
        ? 'done'
        : undefined;
  let nextWorkStatus: WorkStatus | undefined;
  if (nextStatus !== undefined && esWorkKind(current.workKind) && esWorkStatus(current.workStatus)) {
    if (nextStatus === 'done') nextWorkStatus = 'entregado';
    else if (nextStatus === 'in_progress') nextWorkStatus = ['espera_cliente', 'cambios'].includes(current.workStatus) ? current.workStatus : 'en_curso';
    else nextWorkStatus = ['pedido', 'aceptado'].includes(current.workStatus) ? current.workStatus : 'pedido';
  }

  const [updated] = await db
    .update(teamTaskItems)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      // El endpoint PATCH pasa el body crudo, así que el recorte a 20k se
      // hace acá y no en la ruta: es el único punto por el que pasan todos
      // los escritores (REST y MCP).
      ...(patch.aiPrompt !== undefined && { aiPrompt: String(patch.aiPrompt ?? '').slice(0, 20000) }),
      ...(patch.aiNextStep !== undefined && { aiNextStep: String(patch.aiNextStep ?? '').slice(0, 20000) }),
      ...(patch.aiContextQuestion !== undefined && { aiContextQuestion: String(patch.aiContextQuestion ?? '').slice(0, 20000) }),
      ...(patch.aiContextAnswer !== undefined && { aiContextAnswer: String(patch.aiContextAnswer ?? '').slice(0, 20000) }),
      ...(patch.aiReadyAt !== undefined && { aiReadyAt: patch.aiReadyAt ? new Date(patch.aiReadyAt) : null }),
      ...(patch.labelIds !== undefined && { labelIds: patch.labelIds }),
      ...(patch.checklist !== undefined && { checklist: patch.checklist }),
      ...(patch.dueDate !== undefined && { dueDate: patch.dueDate ? new Date(patch.dueDate) : null }),
      ...(patch.startDate !== undefined && { startDate: patch.startDate ? new Date(patch.startDate) : null }),
      ...(patch.endDate !== undefined && { endDate: patch.endDate ? new Date(patch.endDate) : null }),
      ...(nextPrimaryColumnId !== undefined && { columnId: nextPrimaryColumnId }),
      ...(nextPrimaryProjectId !== undefined && { projectId: nextPrimaryProjectId }),
      ...(nextPrimaryOrder !== undefined ? { order: nextPrimaryOrder } : patch.order !== undefined && { order: patch.order }),
      ...(nextStatus !== undefined && {
        status: nextStatus,
        completedAt: nextStatus === 'done' ? new Date() : null,
      }),
      ...(nextWorkStatus !== undefined && { workStatus: nextWorkStatus }),
      ...(patch.parentTaskId !== undefined && { parentTaskId: patch.parentTaskId ? Number(patch.parentTaskId) : null }),
      ...(patch.color !== undefined && { color: patch.color ? String(patch.color) : null }),
      ...(patch.icon !== undefined && { icon: patch.icon ? String(patch.icon) : null }),
      ...(patch.coverMediaId !== undefined && { coverMediaId: patch.coverMediaId ? Number(patch.coverMediaId) : null }),
      ...(patch.assigneeId !== undefined && { assigneeId: patch.assigneeId ? Number(patch.assigneeId) : null }),
      updatedAt: new Date(),
    })
    .where(and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)))
    .returning();

  if (!updated) return { error: 'not_found' as const };

  const taskMessages = await db
    .update(messages)
    .set({
      text: updated.title,
      quotedMessageText: JSON.stringify({ taskId, status: updated.status }),
    })
    .where(like(messages.id, `task_${taskId}_contact_%`))
    .returning();

  for (const taskMessage of taskMessages) {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, taskMessage.chatId),
      columns: { remoteJid: true, instanceId: true },
    });
    if (chat) {
      try {
        await pusherServer.trigger(`team-${teamId}`, 'task-message-update', {
          id: taskMessage.id,
          taskId,
          text: taskMessage.text,
          status: updated.status,
          remoteJid: chat.remoteJid,
          instanceId: chat.instanceId,
        });
      } catch (error) {
        console.error('Could not broadcast task message update:', error);
      }
    }
  }

  return { item: updated };
}

export async function deleteTaskItem(teamId: number, taskId: number) {
  const task = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)),
    columns: { id: true },
  });
  if (!task) return false;

  const taskMessages = await db.query.messages.findMany({
    where: like(messages.id, `task_${taskId}_contact_%`),
    columns: { id: true },
  });
  const messageIds = taskMessages.map((message) => message.id);

  await db.transaction(async (tx) => {
    await tx.delete(teamTaskRelations).where(and(
      eq(teamTaskRelations.teamId, teamId),
      or(
        and(eq(teamTaskRelations.sourceType, 'task'), eq(teamTaskRelations.sourceId, taskId)),
        and(eq(teamTaskRelations.targetType, 'task'), eq(teamTaskRelations.targetId, taskId)),
      ),
    ));
    await tx.delete(teamTaskMedia).where(and(
      eq(teamTaskMedia.teamId, teamId),
      eq(teamTaskMedia.ownerType, 'task'),
      eq(teamTaskMedia.ownerId, taskId),
    ));
    if (messageIds.length) await tx.delete(messages).where(inArray(messages.id, messageIds));
    await tx.delete(teamTaskItems).where(and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)));
  });

  if (messageIds.length) {
    try {
      await pusherServer.trigger(`team-${teamId}`, 'task-message-delete', { taskId, messageIds });
    } catch (error) {
      console.error('Could not broadcast task message deletion:', error);
    }
  }
  return true;
}

export async function listTaskComments(teamId: number, taskId: number) {
  return db.query.teamTaskComments.findMany({
    where: and(eq(teamTaskComments.taskId, taskId), eq(teamTaskComments.teamId, teamId)),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
}

export async function addTaskComment(input: {
  teamId: number;
  userId?: number | null;
  taskId: number;
  text: string;
  /** 'comment' = hilo de conversación; 'report' = parte de trabajo. */
  kind?: 'comment' | 'report';
  /** 'user' = escrito en la app; 'connector' = lo dejó una IA por MCP. */
  source?: 'user' | 'connector';
}) {
  const task = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, input.taskId), eq(teamTaskItems.teamId, input.teamId)),
  });
  if (!task) return null;

  const [comment] = await db
    .insert(teamTaskComments)
    .values({
      taskId: input.taskId,
      teamId: input.teamId,
      text: input.text.trim(),
      kind: input.kind ?? 'comment',
      source: input.source ?? 'user',
      createdBy: input.userId ?? null,
    })
    .returning();
  return comment;
}

export async function createColumnInProject(input: {
  teamId: number;
  projectId: number;
  title: string;
  color?: string | null;
  icon?: string | null;
}) {
  const project = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.id, input.projectId), eq(teamTaskProjects.teamId, input.teamId)),
  });
  if (!project) return null;

  const existing = await db.query.teamTaskColumns.findMany({
    where: eq(teamTaskColumns.projectId, input.projectId),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });
  const order = existing.length ? existing[0].order + 1 : 0;

  const [col] = await db
    .insert(teamTaskColumns)
    .values({
      projectId: input.projectId,
      teamId: input.teamId,
      title: input.title.trim(),
      order,
      color: input.color ?? null,
      icon: input.icon ?? null,
    })
    .returning();
  return col;
}

export async function updateColumn(input: {
  teamId: number;
  columnId: number;
  patch: Partial<{ title: string; order: number; color: string | null; icon: string | null }>;
}) {
  const { teamId, columnId, patch } = input;
  const [updated] = await db
    .update(teamTaskColumns)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.order !== undefined && { order: patch.order }),
      ...(patch.color !== undefined && { color: patch.color || null }),
      ...(patch.icon !== undefined && { icon: patch.icon || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(teamTaskColumns.id, columnId), eq(teamTaskColumns.teamId, teamId)))
    .returning();
  return updated ?? null;
}

export async function deleteColumn(teamId: number, columnId: number) {
  const taskRows = await db.query.teamTaskItems.findMany({
    where: and(eq(teamTaskItems.columnId, columnId), eq(teamTaskItems.teamId, teamId)),
    columns: { id: true },
  });
  for (const task of taskRows) await deleteTaskItem(teamId, task.id);
  await db.delete(teamTaskColumns).where(and(eq(teamTaskColumns.id, columnId), eq(teamTaskColumns.teamId, teamId)));
}

/**
 * Inserta una relación evitando duplicados EN AMBAS DIRECCIONES.
 *
 * `teamTaskRelations` es no dirigida en la práctica (todos los lectores
 * consultan `source OR target`), pero su índice único es sobre la tupla
 * exacta. Sin este chequeo, dos llamadores que expresen el mismo vínculo al
 * revés — históricamente la UI y `link_customer_task` escribían
 * `customer→task` mientras `tasks_links` escribía `task→customer` — crean dos
 * filas para lo mismo: el cliente aparece dos veces en la ficha y desvincular
 * una deja la otra viva.
 *
 * Se resuelve acá, en el único punto de escritura, en vez de en cada
 * llamador: así ningún caller nuevo puede reintroducir el problema.
 */
export async function insertRelation(input: {
  teamId: number;
  userId: number;
  sourceType: TaskEntityType;
  sourceId: number;
  targetType: TaskEntityType;
  targetId: number;
  relationType?: string;
  metadata?: Record<string, unknown>;
}) {
  const relationType = input.relationType ?? 'related';

  const existing = await db.query.teamTaskRelations.findFirst({
    where: and(
      eq(teamTaskRelations.teamId, input.teamId),
      eq(teamTaskRelations.relationType, relationType),
      or(
        and(
          eq(teamTaskRelations.sourceType, input.sourceType),
          eq(teamTaskRelations.sourceId, input.sourceId),
          eq(teamTaskRelations.targetType, input.targetType),
          eq(teamTaskRelations.targetId, input.targetId),
        ),
        and(
          eq(teamTaskRelations.sourceType, input.targetType),
          eq(teamTaskRelations.sourceId, input.targetId),
          eq(teamTaskRelations.targetType, input.sourceType),
          eq(teamTaskRelations.targetId, input.sourceId),
        ),
      ),
    ),
  });
  if (existing) return existing;

  const [relation] = await db
    .insert(teamTaskRelations)
    .values({
      teamId: input.teamId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      relationType,
      metadata: input.metadata ?? {},
      createdBy: input.userId,
    })
    .onConflictDoNothing()
    .returning();
  return relation ?? null;
}

/**
 * Borra TODAS las relaciones de una entidad, en las dos direcciones. Se usa
 * al eliminar clientes, contactos y proyectos: sin esto quedan relaciones
 * colgadas apuntando a ids inexistentes y, como los ids son `serial`, un id
 * reciclado volvería a atar esa tarea a otra entidad.
 */
export async function deleteRelationsFor(teamId: number, type: TaskEntityType, id: number) {
  await db.delete(teamTaskRelations).where(and(
    eq(teamTaskRelations.teamId, teamId),
    or(
      and(eq(teamTaskRelations.sourceType, type), eq(teamTaskRelations.sourceId, id)),
      and(eq(teamTaskRelations.targetType, type), eq(teamTaskRelations.targetId, id)),
    ),
  ));
}

/**
 * Relaciones tarea↔cliente para MUCHAS tareas de una sola vez.
 *
 * La UI necesita mostrar el chip del cliente en cada tarjeta de la lista;
 * pedir los detalles tarea por tarea sería N+1 de red, y hacerlo sólo al
 * abrir la tarea (como antes) dejaba las tarjetas sin chip hasta abrirlas.
 */
export async function listEntityLinksForTasks(
  teamId: number,
  taskIds: number[] | null,
  entityType: 'customer' | 'contact',
) {
  if (taskIds && !taskIds.length) return new Map<number, number[]>();

  const rows = await db.query.teamTaskRelations.findMany({
    where: and(
      eq(teamTaskRelations.teamId, teamId),
      taskIds
        ? or(
            and(eq(teamTaskRelations.sourceType, 'task'), inArray(teamTaskRelations.sourceId, taskIds), eq(teamTaskRelations.targetType, entityType)),
            and(eq(teamTaskRelations.targetType, 'task'), inArray(teamTaskRelations.targetId, taskIds), eq(teamTaskRelations.sourceType, entityType)),
          )
        : or(
            and(eq(teamTaskRelations.sourceType, 'task'), eq(teamTaskRelations.targetType, entityType)),
            and(eq(teamTaskRelations.targetType, 'task'), eq(teamTaskRelations.sourceType, entityType)),
          ),
    ),
  });

  const byTask = new Map<number, number[]>();
  for (const row of rows) {
    const taskId = row.sourceType === 'task' ? row.sourceId : row.targetId;
    const entityId = row.sourceType === entityType ? row.sourceId : row.targetId;
    const current = byTask.get(taskId);
    if (current) {
      if (!current.includes(entityId)) current.push(entityId);
    } else {
      byTask.set(taskId, [entityId]);
    }
  }
  return byTask;
}

/** Atajo histórico: clientes. Los leads (contactos del CRM) usan el mismo
 * mecanismo con `entityType: 'contact'`. */
export async function listCustomerLinksForTasks(teamId: number, taskIds: number[] | null) {
  return listEntityLinksForTasks(teamId, taskIds, 'customer');
}

export async function copyTaskMedia(input: {
  teamId: number;
  userId: number;
  sourceTaskId: number;
  targetTaskId: number;
}) {
  const media = await db.query.teamTaskMedia.findMany({
    where: and(
      eq(teamTaskMedia.teamId, input.teamId),
      eq(teamTaskMedia.ownerType, 'task'),
      eq(teamTaskMedia.ownerId, input.sourceTaskId),
    ),
  });
  if (!media.length) return 0;

  await db.insert(teamTaskMedia).values(media.map((item) => ({
    teamId: input.teamId,
    ownerType: 'task' as const,
    ownerId: input.targetTaskId,
    url: item.url,
    fileName: item.fileName,
    mimeType: item.mimeType,
    size: item.size,
    source: item.source,
    metadata: item.metadata,
    createdBy: input.userId,
  })));

  return media.length;
}

export async function listTaskDetails(teamId: number, taskId: number) {
  const [relations, dependencies, dependents, locations, media] = await Promise.all([
    db.query.teamTaskRelations.findMany({
      where: and(
        eq(teamTaskRelations.teamId, teamId),
        or(
          and(eq(teamTaskRelations.sourceType, 'task'), eq(teamTaskRelations.sourceId, taskId)),
          and(eq(teamTaskRelations.targetType, 'task'), eq(teamTaskRelations.targetId, taskId)),
        ),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
    db.query.teamTaskDependencies.findMany({
      where: and(eq(teamTaskDependencies.teamId, teamId), eq(teamTaskDependencies.taskId, taskId)),
    }),
    db.query.teamTaskDependencies.findMany({
      where: and(eq(teamTaskDependencies.teamId, teamId), eq(teamTaskDependencies.dependsOnTaskId, taskId)),
    }),
    db.query.teamTaskItemLocations.findMany({
      where: and(eq(teamTaskItemLocations.teamId, teamId), eq(teamTaskItemLocations.taskId, taskId)),
    }),
    db.query.teamTaskMedia.findMany({
      where: and(eq(teamTaskMedia.teamId, teamId), eq(teamTaskMedia.ownerType, 'task'), eq(teamTaskMedia.ownerId, taskId)),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
  ]);

  return {
    relations,
    dependencies,
    dependents,
    locations,
    media: media.map((item) => ({ ...item, url: resolveMediaUrl(item.url) ?? item.url })),
  };
}

export async function listInheritedMedia(input: {
  teamId: number;
  ownerType: TaskEntityType;
  ownerId: number;
}) {
  const sources: Array<{ ownerType: string; ownerId: number; inheritedFrom: string }> = [
    { ownerType: input.ownerType, ownerId: input.ownerId, inheritedFrom: 'direct' },
  ];

  if (input.ownerType === 'task') {
    const task = await assertTask(input.teamId, input.ownerId);
    if (task) {
      sources.push({ ownerType: 'project', ownerId: task.projectId, inheritedFrom: 'project' });
      const project = await assertProject(input.teamId, task.projectId);
      if (project?.workspaceId) {
        sources.push({ ownerType: 'workspace', ownerId: project.workspaceId, inheritedFrom: 'workspace' });
      }
    }
  }

  if (input.ownerType === 'project') {
    const project = await assertProject(input.teamId, input.ownerId);
    if (project?.workspaceId) {
      sources.push({ ownerType: 'workspace', ownerId: project.workspaceId, inheritedFrom: 'workspace' });
    }
  }

  const rows = await db.query.teamTaskMedia.findMany({
    where: and(eq(teamTaskMedia.teamId, input.teamId)),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  const sourceKey = new Map(sources.map((source) => [`${source.ownerType}:${source.ownerId}`, source.inheritedFrom]));
  const taskMedia = rows
    .filter((row) => sourceKey.has(`${row.ownerType}:${row.ownerId}`))
    .map((row) => ({
      ...row,
      url: resolveMediaUrl(row.url) ?? row.url,
      inheritedFrom: sourceKey.get(`${row.ownerType}:${row.ownerId}`) ?? 'direct',
    }));

  const contactRelations = await db.query.teamTaskRelations.findMany({
    where: and(
      eq(teamTaskRelations.teamId, input.teamId),
      eq(teamTaskRelations.targetType, 'contact'),
      eq(teamTaskRelations.sourceType, input.ownerType),
      eq(teamTaskRelations.sourceId, input.ownerId),
    ),
  });

  if (!contactRelations.length) return taskMedia;

  const contactRows = await db.query.contacts.findMany({
    where: and(
      eq(contacts.teamId, input.teamId),
      inArray(contacts.id, contactRelations.map((relation) => relation.targetId)),
    ),
    with: { chat: true },
  });

  const chatIds = contactRows.map((contact) => contact.chatId);
  if (!chatIds.length) return taskMedia;

  const messageRows = await db.query.messages.findMany({
    where: and(inArray(messages.chatId, chatIds)),
    orderBy: (t, { desc }) => [desc(t.timestamp)],
    limit: 50,
  });

  return [
    ...taskMedia,
    ...messageRows
      .filter((message) => message.mediaUrl)
      .map((message) => ({
        id: `contact-${message.id}`,
        teamId: input.teamId,
        ownerType: 'contact',
        ownerId: contactRows.find((contact) => contact.chatId === message.chatId)?.id ?? 0,
        url: resolveMediaUrl(message.mediaUrl) ?? message.mediaUrl,
        fileName: message.text || message.mediaCaption || 'Media',
        mimeType: message.mediaMimetype,
        size: message.mediaFileLength ? Number(message.mediaFileLength) : null,
        source: 'contact',
        metadata: { messageId: message.id },
        createdBy: null,
        createdAt: message.timestamp,
        inheritedFrom: 'contact',
      })),
  ];
}

export function normalizeLabels(labels: unknown): TaskLabel[] {
  return Array.isArray(labels)
    ? labels
        .map((label) => ({
          id: String((label as TaskLabel).id ?? ''),
          name: String((label as TaskLabel).name ?? '').trim(),
          color: String((label as TaskLabel).color ?? '#64748b'),
        }))
        .filter((label) => label.id && label.name)
    : [];
}

/**
 * Merge duplicate-named projects (case-insensitive trim) within a workspace (or all for team).
 * Keeps the lowest-id project as canonical, moves locations + primary pointers, deletes dups.
 * Safe for tasks that may have multi-locations.
 */
export async function mergeDuplicateNamedProjects(teamId: number, workspaceId?: number) {
  const whereProjects = workspaceId
    ? and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, workspaceId))
    : eq(teamTaskProjects.teamId, teamId);

  const allProjects = await db.query.teamTaskProjects.findMany({
    where: whereProjects,
    orderBy: (t, { asc }) => [asc(t.id)],
  });

  // group by normalized name within same ws
  const groups = new Map<string, typeof allProjects>();
  for (const p of allProjects) {
    const key = `${p.workspaceId ?? 0}::${p.name.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  let mergedCount = 0;
  for (const projs of groups.values()) {
    if (projs.length <= 1) continue;
    // keeper = lowest id (already sorted)
    const [keeper, ...dups] = projs;
    if (!keeper) continue;

    for (const dup of dups) {
      // find columns in keeper by title (prefer match)
      const keeperCols = await db.query.teamTaskColumns.findMany({
        where: eq(teamTaskColumns.projectId, keeper.id),
      });
      const keeperColByTitle = new Map(keeperCols.map((c) => [c.title.trim().toLowerCase(), c]));

      // columns of dup
      const dupCols = await db.query.teamTaskColumns.findMany({
        where: eq(teamTaskColumns.projectId, dup.id),
      });

      // build map dupColId -> keeperCol (create missing titles in keeper)
      const colMap = new Map<number, number>();
      for (const dc of dupCols) {
        const norm = dc.title.trim().toLowerCase();
        let kc = keeperColByTitle.get(norm);
        if (!kc) {
          const maxOrder = keeperCols.length ? Math.max(...keeperCols.map((k) => k.order)) + 1 : 0;
          const [newCol] = await db.insert(teamTaskColumns).values({
            teamId,
            projectId: keeper.id,
            title: dc.title,
            order: maxOrder,
          }).returning();
          kc = newCol;
          keeperCols.push(newCol);
          keeperColByTitle.set(norm, newCol);
        }
        if (kc) colMap.set(dc.id, kc.id);
      }

      // move locations from dup -> keeper (update project+col)
      const dupLocs = await db.query.teamTaskItemLocations.findMany({
        where: and(eq(teamTaskItemLocations.teamId, teamId), eq(teamTaskItemLocations.projectId, dup.id)),
      });
      for (const loc of dupLocs) {
        const targetCol = colMap.get(loc.columnId) ?? keeperCols[0]?.id;
        if (!targetCol) continue;
        // avoid unique violation (task+project)
        const exists = await db.query.teamTaskItemLocations.findFirst({
          where: and(
            eq(teamTaskItemLocations.taskId, loc.taskId),
            eq(teamTaskItemLocations.projectId, keeper.id),
          ),
        });
        if (exists) {
          // already present in keeper: drop this loc (task unified)
          await db.delete(teamTaskItemLocations).where(eq(teamTaskItemLocations.id, loc.id));
        } else {
          await db.update(teamTaskItemLocations)
            .set({ projectId: keeper.id, columnId: targetCol, updatedAt: new Date() })
            .where(eq(teamTaskItemLocations.id, loc.id));
        }
      }

      // if any items have primary pointing at dup, retarget
      await db.update(teamTaskItems)
        .set({ projectId: keeper.id, columnId: keeperCols[0]?.id ?? null, updatedAt: new Date() })
        .where(and(eq(teamTaskItems.projectId, dup.id), eq(teamTaskItems.teamId, teamId)));

      // delete dup project (cascades its columns + remaining locs)
      await db.delete(teamTaskProjects).where(eq(teamTaskProjects.id, dup.id));
      mergedCount++;
    }
  }

  return { merged: mergedCount };
}
