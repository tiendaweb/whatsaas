import { and, count, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
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

export type TaskEntityType = 'workspace' | 'project' | 'task' | 'contact';

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

export async function assertEntity(teamId: number, type: TaskEntityType, id: number) {
  if (type === 'task') return Boolean(await assertTask(teamId, id));
  if (type === 'project') return Boolean(await assertProject(teamId, id));
  if (type === 'workspace') return Boolean(await assertWorkspace(teamId, id));
  if (type === 'contact') return Boolean(await assertContact(teamId, id));
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
  labelIds: string[];
  checklist: TaskChecklistItem[];
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  columnId: number;
  order: number;
  status: string;
  parentTaskId: number | null;
  projectId: number;
  color: string | null;
  icon: string | null;
  coverMediaId: number | null;
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
  if (patch.columnId !== undefined) {
    const column = await db.query.teamTaskColumns.findFirst({
      where: and(eq(teamTaskColumns.id, Number(patch.columnId)), eq(teamTaskColumns.teamId, teamId)),
    });
    if (!column) return { error: 'column_not_found' as const };
    nextProjectId = patch.projectId ? Number(patch.projectId) : column.projectId;

    const location = await db.query.teamTaskItemLocations.findFirst({
      where: and(
        eq(teamTaskItemLocations.taskId, current.id),
        eq(teamTaskItemLocations.projectId, nextProjectId),
        eq(teamTaskItemLocations.teamId, teamId),
      ),
    });

    if (location) {
      await db
        .update(teamTaskItemLocations)
        .set({
          columnId: Number(patch.columnId),
          ...(patch.order !== undefined && { order: Number(patch.order) }),
          updatedAt: new Date(),
        })
        .where(eq(teamTaskItemLocations.id, location.id));
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

  const [updated] = await db
    .update(teamTaskItems)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.labelIds !== undefined && { labelIds: patch.labelIds }),
      ...(patch.checklist !== undefined && { checklist: patch.checklist }),
      ...(patch.dueDate !== undefined && { dueDate: patch.dueDate ? new Date(patch.dueDate) : null }),
      ...(patch.startDate !== undefined && { startDate: patch.startDate ? new Date(patch.startDate) : null }),
      ...(patch.endDate !== undefined && { endDate: patch.endDate ? new Date(patch.endDate) : null }),
      ...(patch.columnId !== undefined && { columnId: Number(patch.columnId) }),
      ...(nextProjectId !== undefined && { projectId: nextProjectId }),
      ...(patch.order !== undefined && { order: patch.order }),
      ...(nextStatus !== undefined && {
        status: nextStatus,
        completedAt: nextStatus === 'done' ? new Date() : null,
      }),
      ...(patch.parentTaskId !== undefined && { parentTaskId: patch.parentTaskId ? Number(patch.parentTaskId) : null }),
      ...(patch.color !== undefined && { color: patch.color ? String(patch.color) : null }),
      ...(patch.icon !== undefined && { icon: patch.icon ? String(patch.icon) : null }),
      ...(patch.coverMediaId !== undefined && { coverMediaId: patch.coverMediaId ? Number(patch.coverMediaId) : null }),
      updatedAt: new Date(),
    })
    .where(and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)))
    .returning();

  if (!updated) return { error: 'not_found' as const };
  return { item: updated };
}

export async function deleteTaskItem(teamId: number, taskId: number) {
  await db.delete(teamTaskItems).where(and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)));
}

export async function listTaskComments(teamId: number, taskId: number) {
  return db.query.teamTaskComments.findMany({
    where: and(eq(teamTaskComments.taskId, taskId), eq(teamTaskComments.teamId, teamId)),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
}

export async function addTaskComment(input: { teamId: number; userId?: number | null; taskId: number; text: string }) {
  const task = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, input.taskId), eq(teamTaskItems.teamId, input.teamId)),
  });
  if (!task) return null;

  const [comment] = await db
    .insert(teamTaskComments)
    .values({ taskId: input.taskId, teamId: input.teamId, text: input.text.trim(), createdBy: input.userId ?? null })
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
  await db.delete(teamTaskColumns).where(and(eq(teamTaskColumns.id, columnId), eq(teamTaskColumns.teamId, teamId)));
}

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
  const [relation] = await db
    .insert(teamTaskRelations)
    .values({
      teamId: input.teamId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      relationType: input.relationType ?? 'related',
      metadata: input.metadata ?? {},
      createdBy: input.userId,
    })
    .onConflictDoNothing()
    .returning();
  return relation ?? null;
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
