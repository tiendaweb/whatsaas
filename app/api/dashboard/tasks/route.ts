import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserPermissionContext, type PermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  departmentMembers,
  teamTaskColumns,
  teamTaskItemLocations,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
} from '@/lib/db/schema';
import { hasPermission } from '@/lib/permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { createContactTask } from '@/lib/plugins/tasks/server/contact-tasks';
import {
  assertProject,
  createTaskInColumn,
  deleteTaskItem,
  getProjectFirstColumn,
  patchTaskItem,
} from '@/lib/plugins/tasks/server/task-os';
import { ensureDefaultTaskWorkspace } from '@/lib/plugins/tasks/server/workspaces';

export const dynamic = 'force-dynamic';

const TEAM_TASK_PROJECT_NAME = 'Tareas del equipo';

const updateSchema = z.object({
  updates: z.array(z.object({
    taskId: z.number().int().positive(),
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().max(10_000).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    status: z.enum(['open', 'in_progress', 'done']).optional(),
    order: z.number().int().min(0).optional(),
  }).refine((update) => Object.keys(update).some((key) => key !== 'taskId'), {
    message: 'At least one task field is required',
  })).min(1).max(1_000),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(10_000).optional().default(''),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional().default('open'),
  contactId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
});

const deleteSchema = z.object({
  taskId: z.number().int().positive(),
});

async function getContext(resource: 'tasksRead' | 'tasksWrite') {
  const context = await getUserPermissionContext();
  if (!context) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!hasPermission(context.role, context.permissions, resource)) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const active = await resolveActivePluginsForTeam(context.teamId, context.userId);
  if (!active.some((entry) => entry.pluginId === 'tasks')) {
    return { response: NextResponse.json({ error: 'plugin_disabled' }, { status: 403 }) };
  }

  return { context };
}

async function getAccessibleContacts(context: PermissionContext) {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      chatId: contacts.chatId,
      assignedUserId: contacts.assignedUserId,
      assignedDepartmentId: contacts.assignedDepartmentId,
      remoteJid: chats.remoteJid,
      profilePicUrl: chats.profilePicUrl,
    })
    .from(contacts)
    .innerJoin(chats, and(eq(chats.id, contacts.chatId), eq(chats.teamId, context.teamId)))
    .where(eq(contacts.teamId, context.teamId));

  if (context.canSeeAllChats) return rows;

  if (context.chatVisibility === 'department') {
    const memberships = await db.query.departmentMembers.findMany({
      where: eq(departmentMembers.userId, context.userId),
      columns: { departmentId: true },
    });
    const departmentIds = new Set(memberships.map((membership) => membership.departmentId));
    return rows.filter((contact) => (
      contact.assignedUserId === context.userId
      || (contact.assignedDepartmentId != null && departmentIds.has(contact.assignedDepartmentId))
    ));
  }

  return rows.filter((contact) => contact.assignedUserId === context.userId);
}

async function ensureTeamTaskProject(teamId: number, userId: number) {
  const existing = await db.query.teamTaskProjects.findFirst({
    where: and(
      eq(teamTaskProjects.teamId, teamId),
      eq(teamTaskProjects.name, TEAM_TASK_PROJECT_NAME),
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
      name: TEAM_TASK_PROJECT_NAME,
      order: 0,
      createdBy: userId,
    })
    .returning();
  return project;
}

async function loadDashboardTasks(context: PermissionContext) {
  const contactRows = await getAccessibleContacts(context);
  const accessibleContactIds = new Set(contactRows.map((contact) => contact.id));

  const relationRows = await db.query.teamTaskRelations.findMany({
    where: and(
      eq(teamTaskRelations.teamId, context.teamId),
      or(
        and(
          eq(teamTaskRelations.sourceType, 'task'),
          eq(teamTaskRelations.targetType, 'contact'),
        ),
        and(
          eq(teamTaskRelations.sourceType, 'contact'),
          eq(teamTaskRelations.targetType, 'task'),
        ),
      ),
    ),
    columns: { sourceType: true, sourceId: true, targetId: true },
  });

  const contactIdsByTask = new Map<number, Set<number>>();
  for (const relation of relationRows) {
    const taskId = relation.sourceType === 'task' ? relation.sourceId : relation.targetId;
    const contactId = relation.sourceType === 'task' ? relation.targetId : relation.sourceId;
    const linked = contactIdsByTask.get(taskId) ?? new Set<number>();
    linked.add(contactId);
    contactIdsByTask.set(taskId, linked);
  }

  const contactLinkedTaskIds = [...contactIdsByTask.keys()];
  const taskRows = await db
    .select({
      id: teamTaskItems.id,
      title: teamTaskItems.title,
      notes: teamTaskItems.notes,
      status: teamTaskItems.status,
      order: teamTaskItems.order,
      dueDate: teamTaskItems.dueDate,
      createdAt: teamTaskItems.createdAt,
      updatedAt: teamTaskItems.updatedAt,
      projectId: teamTaskItems.projectId,
      projectName: teamTaskProjects.name,
      projectColor: teamTaskProjects.color,
      columnId: teamTaskItems.columnId,
      columnName: teamTaskColumns.title,
      checklist: teamTaskItems.checklist,
    })
    .from(teamTaskItems)
    .innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItems.projectId))
    .innerJoin(teamTaskColumns, eq(teamTaskColumns.id, teamTaskItems.columnId))
    .where(and(
      eq(teamTaskItems.teamId, context.teamId),
      contactLinkedTaskIds.length
        ? or(isNull(teamTaskItems.parentTaskId), inArray(teamTaskItems.id, contactLinkedTaskIds))
        : isNull(teamTaskItems.parentTaskId),
    ))
    .orderBy(asc(teamTaskItems.order), asc(teamTaskItems.createdAt), asc(teamTaskItems.id));

  const contactsById = new Map(contactRows.map((contact) => [contact.id, contact]));
  const tasks = [];
  for (const { checklist, ...task } of taskRows) {
    const linkedContactIds = [...(contactIdsByTask.get(task.id) ?? [])];
    const visibleContacts = linkedContactIds
      .filter((contactId) => accessibleContactIds.has(contactId))
      .map((contactId) => contactsById.get(contactId))
      .filter((contact): contact is NonNullable<typeof contact> => contact != null)
      .map(({ assignedUserId: _assignedUserId, assignedDepartmentId: _assignedDepartmentId, ...contact }) => contact);

    // Tareas ligadas a contactos que el usuario no puede ver quedan fuera del tablero.
    if (linkedContactIds.length > 0 && visibleContacts.length === 0) continue;

    const checklistItems = Array.isArray(checklist) ? checklist : [];
    tasks.push({
      ...task,
      source: linkedContactIds.length > 0 ? ('contact' as const) : ('team' as const),
      checklistTotal: checklistItems.length,
      checklistDone: checklistItems.filter((item) => item?.completed).length,
      contacts: visibleContacts,
    });
  }

  return { contacts: contactRows, tasks };
}

async function loadProjects(teamId: number) {
  const rows = await db.query.teamTaskProjects.findMany({
    where: eq(teamTaskProjects.teamId, teamId),
    columns: { id: true, name: true, color: true },
    orderBy: (table, { asc: orderAsc }) => [orderAsc(table.order), orderAsc(table.createdAt)],
  });
  return rows;
}

export async function GET() {
  const result = await getContext('tasksRead');
  if ('response' in result) return result.response;

  try {
    const [data, projects] = await Promise.all([
      loadDashboardTasks(result.context),
      loadProjects(result.context.teamId),
    ]);
    return NextResponse.json({
      enabled: true,
      canWrite: hasPermission(result.context.role, result.context.permissions, 'tasksWrite'),
      tasks: data.tasks,
      projects,
    });
  } catch (error) {
    console.error('[dashboard/tasks GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await getContext('tasksWrite');
  if ('response' in result) return result.response;
  const { context } = result;

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid task', details: parsed.error.flatten() }, { status: 400 });
    }
    const { title, notes, dueDate, status, contactId, projectId } = parsed.data;

    if (contactId) {
      const accessible = await getAccessibleContacts(context);
      if (!accessible.some((contact) => contact.id === contactId)) {
        return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });
      }
      const created = await createContactTask({
        teamId: context.teamId,
        userId: context.userId,
        contactId,
        title,
        notes,
        dueDate: dueDate ?? null,
        status,
      });
      if ('error' in created) return NextResponse.json({ error: created.error }, { status: 404 });
      return NextResponse.json({ task: created.task }, { status: 201 });
    }

    let targetProjectId = projectId ?? null;
    if (targetProjectId) {
      const project = await assertProject(context.teamId, targetProjectId);
      if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    } else {
      const project = await ensureTeamTaskProject(context.teamId, context.userId);
      targetProjectId = project.id;
    }

    const column = await getProjectFirstColumn(context.teamId, targetProjectId);
    const task = await createTaskInColumn({
      teamId: context.teamId,
      userId: context.userId,
      columnId: column.id,
      title,
      notes,
      dueDate: dueDate ?? null,
      status,
    });
    if (!task) return NextResponse.json({ error: 'task_not_created' }, { status: 500 });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('[dashboard/tasks POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const result = await getContext('tasksWrite');
  if ('response' in result) return result.response;

  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid task update', details: parsed.error.flatten() }, { status: 400 });
    }

    const data = await loadDashboardTasks(result.context);
    const accessibleTaskIds = new Set(data.tasks.map((task) => task.id));
    if (parsed.data.updates.some((update) => !accessibleTaskIds.has(update.taskId))) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updated = [];
    for (const { taskId, order, ...taskPatch } of parsed.data.updates) {
      let updatedItem;
      if (Object.keys(taskPatch).length > 0) {
        const task = await patchTaskItem({ teamId: result.context.teamId, taskId, patch: taskPatch });
        if ('error' in task) return NextResponse.json({ error: task.error }, { status: 404 });
        updatedItem = task.item;
      }
      if (order !== undefined) {
        const [reorderedItem] = await db
          .update(teamTaskItems)
          .set({ order, updatedAt: new Date() })
          .where(and(eq(teamTaskItems.teamId, result.context.teamId), eq(teamTaskItems.id, taskId)))
          .returning();
        await db
          .update(teamTaskItemLocations)
          .set({ order, updatedAt: new Date() })
          .where(and(
            eq(teamTaskItemLocations.teamId, result.context.teamId),
            eq(teamTaskItemLocations.taskId, taskId),
            eq(teamTaskItemLocations.isPrimary, true),
          ));
        updatedItem = reorderedItem ?? updatedItem;
      }
      if (updatedItem) updated.push(updatedItem);
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.error('[dashboard/tasks PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const result = await getContext('tasksWrite');
  if ('response' in result) return result.response;

  try {
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid task', details: parsed.error.flatten() }, { status: 400 });
    }

    const data = await loadDashboardTasks(result.context);
    if (!data.tasks.some((task) => task.id === parsed.data.taskId)) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await deleteTaskItem(result.context.teamId, parsed.data.taskId);
    return NextResponse.json({ deleted: parsed.data.taskId });
  } catch (error) {
    console.error('[dashboard/tasks DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
