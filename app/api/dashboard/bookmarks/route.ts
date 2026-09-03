import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  dashboardBookmarkGroups,
  dashboardBookmarkItems,
  departmentMembers,
  funnelStageGroups,
  teamCustomerContacts,
  teamTaskItems,
  teamTaskProjects,
  teamTaskWorkspaces,
} from '@/lib/db/schema';
import { getUserPermissionContext, type PermissionContext } from '@/lib/auth/permissions-guard';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GROUP_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#059669',
  '#0891B2',
] as const;
const groupColorSchema = z.string().regex(/^#[0-9A-F]{6}$/i);

const bookmarkActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_group'),
    name: z.string().trim().min(1).max(120),
    color: groupColorSchema.default(GROUP_COLORS[0]),
    funnelStageGroupId: z.number().int().positive().nullable().optional(),
  }),
  z.object({
    action: z.literal('update_group'),
    groupId: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    color: groupColorSchema,
    funnelStageGroupId: z.number().int().positive().nullable().optional(),
  }),
  z.object({
    action: z.literal('delete_group'),
    groupId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('reorder_groups'),
    groupIds: z.array(z.number().int().positive()).max(100),
  }),
  z.object({
    action: z.literal('add_item'),
    groupId: z.number().int().positive(),
    entityType: z.enum(['chat', 'project']),
    entityId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('remove_item'),
    itemId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('reorder_items'),
    groups: z.array(z.object({
      groupId: z.number().int().positive(),
      itemIds: z.array(z.number().int().positive()).max(500),
    })).max(100),
  }),
]);

async function getVisibleChats(context: PermissionContext) {
  const teamChats = await db.query.chats.findMany({
    where: eq(chats.teamId, context.teamId),
    orderBy: (table, { desc }) => [desc(table.lastMessageTimestamp)],
    with: {
      contact: {
        columns: {
          id: true,
          name: true,
          assignedUserId: true,
          assignedDepartmentId: true,
        },
          with: {
            funnelStage: {
              columns: { id: true, name: true, emoji: true },
            },
            contactTags: {
              with: {
                tag: {
                  columns: { id: true, name: true, color: true },
                },
              },
            },
        },
      },
    },
  });

  if (context.canSeeAllChats) {
    return teamChats.filter((chat) => Boolean(chat.contact));
  }

  let departmentIds = new Set<number>();
  if (context.chatVisibility === 'department') {
    const memberships = await db.query.departmentMembers.findMany({
      where: eq(departmentMembers.userId, context.userId),
      columns: { departmentId: true },
    });
    departmentIds = new Set(memberships.map((membership) => membership.departmentId));
  }

  return teamChats.filter((chat) => {
    if (!chat.contact) return false;
    if (chat.contact.assignedUserId === context.userId) return true;
    return context.chatVisibility === 'department'
      && chat.contact.assignedDepartmentId != null
      && departmentIds.has(chat.contact.assignedDepartmentId);
  });
}

async function getTasksCapability(context: PermissionContext) {
  if (!context.permissions.tasksRead) return false;
  const activePlugins = await resolveActivePluginsForTeam(context.teamId, context.userId);
  return activePlugins.some((plugin) => plugin.pluginId === 'tasks');
}

export async function GET() {
  try {
    const context = await getUserPermissionContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [groupRows, itemRows, visibleChats, tasksEnabled, funnelGroupRows] = await Promise.all([
      db.select().from(dashboardBookmarkGroups)
        .where(eq(dashboardBookmarkGroups.teamId, context.teamId))
        .orderBy(asc(dashboardBookmarkGroups.order), asc(dashboardBookmarkGroups.createdAt)),
      db.select().from(dashboardBookmarkItems)
        .where(eq(dashboardBookmarkItems.teamId, context.teamId))
        .orderBy(asc(dashboardBookmarkItems.order), asc(dashboardBookmarkItems.createdAt)),
      getVisibleChats(context),
      getTasksCapability(context),
      db.select({
        id: funnelStageGroups.id,
        name: funnelStageGroups.name,
        description: funnelStageGroups.description,
        order: funnelStageGroups.order,
      }).from(funnelStageGroups)
        .where(eq(funnelStageGroups.teamId, context.teamId))
        .orderBy(asc(funnelStageGroups.order), asc(funnelStageGroups.createdAt)),
    ]);

    const contactIds = visibleChats
      .map((chat) => chat.contact?.id)
      .filter((id): id is number => id != null);
    const customerLinks = context.permissions.customersRead && contactIds.length > 0
      ? await db
          .select({ contactId: teamCustomerContacts.contactId })
          .from(teamCustomerContacts)
          .where(and(
            eq(teamCustomerContacts.teamId, context.teamId),
            inArray(teamCustomerContacts.contactId, contactIds),
          ))
      : [];
    const customerContactIds = new Set(customerLinks.map((link) => link.contactId));

    const projectRows = tasksEnabled
      ? await db
          .select({
            id: teamTaskProjects.id,
            name: teamTaskProjects.name,
            color: teamTaskProjects.color,
            icon: teamTaskProjects.icon,
            workspaceId: teamTaskProjects.workspaceId,
            workspaceName: teamTaskWorkspaces.name,
          })
          .from(teamTaskProjects)
          .leftJoin(teamTaskWorkspaces, eq(teamTaskProjects.workspaceId, teamTaskWorkspaces.id))
          .where(eq(teamTaskProjects.teamId, context.teamId))
          .orderBy(asc(teamTaskProjects.order), asc(teamTaskProjects.createdAt))
      : [];

    const projectStats = tasksEnabled
      ? await db
          .select({
            projectId: teamTaskItems.projectId,
            taskCount: sql<number>`count(*)::int`,
            completedCount: sql<number>`count(*) filter (where ${teamTaskItems.status} = 'done')::int`,
          })
          .from(teamTaskItems)
          .where(eq(teamTaskItems.teamId, context.teamId))
          .groupBy(teamTaskItems.projectId)
      : [];
    const statsByProject = new Map(projectStats.map((row) => [row.projectId, row]));

    const chatCatalog = visibleChats.map((chat) => ({
      id: chat.id,
      remoteJid: chat.remoteJid,
      instanceId: chat.instanceId,
      name: chat.contact?.name || chat.pushName || chat.name || chat.remoteJid.split('@')[0],
      profilePicUrl: chat.profilePicUrl,
      unreadCount: chat.unreadCount ?? 0,
      lastMessageText: chat.lastMessageText,
      lastMessageStatus: chat.lastMessageStatus,
      lastMessageFromMe: chat.lastMessageFromMe,
      automationDisabled: chat.automationDisabled ?? false,
      funnelStage: chat.contact?.funnelStage ?? null,
      tags: chat.contact?.contactTags.map((contactTag) => contactTag.tag) ?? [],
      contactId: chat.contact?.id ?? null,
      isCustomer: chat.contact?.id ? customerContactIds.has(chat.contact.id) : false,
    }));
    const projectCatalog = projectRows.map((project) => {
      const stats = statsByProject.get(project.id);
      return {
        ...project,
        taskCount: stats?.taskCount ?? 0,
        completedCount: stats?.completedCount ?? 0,
      };
    });

    const chatsById = new Map(chatCatalog.map((chat) => [chat.id, chat]));
    const projectsById = new Map(projectCatalog.map((project) => [project.id, project]));
    const itemsByGroup = new Map<number, Array<Record<string, unknown>>>();

    for (const item of itemRows) {
      const entity = item.entityType === 'chat' && item.chatId
        ? chatsById.get(item.chatId)
        : item.entityType === 'project' && item.projectId
          ? projectsById.get(item.projectId)
          : undefined;
      if (!entity) continue;
      const current = itemsByGroup.get(item.groupId) ?? [];
      current.push({
        id: item.id,
        groupId: item.groupId,
        entityType: item.entityType,
        order: item.order,
        ...(item.entityType === 'chat' ? { chat: entity } : { project: entity }),
      });
      itemsByGroup.set(item.groupId, current);
    }

    const funnelGroupsById = new Map(funnelGroupRows.map((group) => [group.id, group]));

    return NextResponse.json({
      groups: groupRows.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
        order: group.order,
        funnelStageGroupId: group.funnelStageGroupId,
        funnelStageGroupName: group.funnelStageGroupId
          ? funnelGroupsById.get(group.funnelStageGroupId)?.name ?? null
          : null,
        items: itemsByGroup.get(group.id) ?? [],
      })),
      funnelGroups: funnelGroupRows,
      catalog: {
        chats: chatCatalog,
        projects: projectCatalog,
      },
      capabilities: {
        projects: tasksEnabled,
        customers: context.permissions.customersRead,
      },
    });
  } catch (error) {
    console.error('[dashboard/bookmarks GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getUserPermissionContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = bookmarkActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const input = parsed.data;

    if (input.action === 'create_group') {
      const linkedFunnelGroup = input.funnelStageGroupId
        ? await db.query.funnelStageGroups.findFirst({
            where: and(
              eq(funnelStageGroups.id, input.funnelStageGroupId),
              eq(funnelStageGroups.teamId, context.teamId),
            ),
            columns: { id: true, name: true },
          })
        : null;
      if (input.funnelStageGroupId && !linkedFunnelGroup) {
        return NextResponse.json({ error: 'Funnel group not found' }, { status: 404 });
      }
      const [last] = await db
        .select({ order: max(dashboardBookmarkGroups.order) })
        .from(dashboardBookmarkGroups)
        .where(eq(dashboardBookmarkGroups.teamId, context.teamId));
      const [group] = await db.insert(dashboardBookmarkGroups).values({
        teamId: context.teamId,
        funnelStageGroupId: linkedFunnelGroup?.id ?? null,
        name: input.name,
        color: input.color,
        order: (last?.order ?? -1) + 1,
        createdBy: context.userId,
      }).returning();
      return NextResponse.json(group, { status: 201 });
    }

    if (input.action === 'update_group') {
      const linkedFunnelGroup = input.funnelStageGroupId
        ? await db.query.funnelStageGroups.findFirst({
            where: and(
              eq(funnelStageGroups.id, input.funnelStageGroupId),
              eq(funnelStageGroups.teamId, context.teamId),
            ),
            columns: { id: true },
          })
        : null;
      if (input.funnelStageGroupId && !linkedFunnelGroup) {
        return NextResponse.json({ error: 'Funnel group not found' }, { status: 404 });
      }
      const [group] = await db.update(dashboardBookmarkGroups)
        .set({
          name: input.name,
          color: input.color,
          ...(input.funnelStageGroupId !== undefined
            ? { funnelStageGroupId: linkedFunnelGroup?.id ?? null }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(
          eq(dashboardBookmarkGroups.id, input.groupId),
          eq(dashboardBookmarkGroups.teamId, context.teamId),
        ))
        .returning();
      if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      return NextResponse.json(group);
    }

    if (input.action === 'delete_group') {
      const [group] = await db.delete(dashboardBookmarkGroups)
        .where(and(
          eq(dashboardBookmarkGroups.id, input.groupId),
          eq(dashboardBookmarkGroups.teamId, context.teamId),
        ))
        .returning({ id: dashboardBookmarkGroups.id });
      if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    if (input.action === 'reorder_groups') {
      const ownedGroups = input.groupIds.length
        ? await db.select({ id: dashboardBookmarkGroups.id })
          .from(dashboardBookmarkGroups)
          .where(and(
            eq(dashboardBookmarkGroups.teamId, context.teamId),
            inArray(dashboardBookmarkGroups.id, input.groupIds),
          ))
        : [];
      if (ownedGroups.length !== input.groupIds.length) {
        return NextResponse.json({ error: 'Invalid group list' }, { status: 400 });
      }
      await db.transaction(async (tx) => {
        for (const [order, groupId] of input.groupIds.entries()) {
          await tx.update(dashboardBookmarkGroups)
            .set({ order, updatedAt: new Date() })
            .where(and(
              eq(dashboardBookmarkGroups.id, groupId),
              eq(dashboardBookmarkGroups.teamId, context.teamId),
            ));
        }
      });
      return NextResponse.json({ success: true });
    }

    if (input.action === 'add_item') {
      const [group] = await db.select({ id: dashboardBookmarkGroups.id })
        .from(dashboardBookmarkGroups)
        .where(and(
          eq(dashboardBookmarkGroups.id, input.groupId),
          eq(dashboardBookmarkGroups.teamId, context.teamId),
        ))
        .limit(1);
      if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

      if (input.entityType === 'chat') {
        const visibleChats = await getVisibleChats(context);
        if (!visibleChats.some((chat) => chat.id === input.entityId)) {
          return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }
      } else {
        if (!await getTasksCapability(context)) {
          return NextResponse.json({ error: 'Projects are not available' }, { status: 403 });
        }
        const [project] = await db.select({ id: teamTaskProjects.id })
          .from(teamTaskProjects)
          .where(and(
            eq(teamTaskProjects.id, input.entityId),
            eq(teamTaskProjects.teamId, context.teamId),
          ))
          .limit(1);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const duplicateWhere = input.entityType === 'chat'
        ? and(
            eq(dashboardBookmarkItems.groupId, input.groupId),
            eq(dashboardBookmarkItems.chatId, input.entityId),
          )
        : and(
            eq(dashboardBookmarkItems.groupId, input.groupId),
            eq(dashboardBookmarkItems.projectId, input.entityId),
          );
      const [duplicate] = await db.select({ id: dashboardBookmarkItems.id })
        .from(dashboardBookmarkItems)
        .where(duplicateWhere)
        .limit(1);
      if (duplicate) return NextResponse.json({ error: 'Item already exists' }, { status: 409 });

      const [last] = await db
        .select({ order: max(dashboardBookmarkItems.order) })
        .from(dashboardBookmarkItems)
        .where(and(
          eq(dashboardBookmarkItems.teamId, context.teamId),
          eq(dashboardBookmarkItems.groupId, input.groupId),
        ));
      const [item] = await db.insert(dashboardBookmarkItems).values({
        teamId: context.teamId,
        groupId: input.groupId,
        entityType: input.entityType,
        chatId: input.entityType === 'chat' ? input.entityId : null,
        projectId: input.entityType === 'project' ? input.entityId : null,
        order: (last?.order ?? -1) + 1,
        createdBy: context.userId,
      }).returning();
      return NextResponse.json(item, { status: 201 });
    }

    if (input.action === 'remove_item') {
      const [item] = await db.delete(dashboardBookmarkItems)
        .where(and(
          eq(dashboardBookmarkItems.id, input.itemId),
          eq(dashboardBookmarkItems.teamId, context.teamId),
        ))
        .returning({ id: dashboardBookmarkItems.id });
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    const groupIds = input.groups.map((group) => group.groupId);
    const itemIds = input.groups.flatMap((group) => group.itemIds);
    const ownedGroups = groupIds.length
      ? await db.select({ id: dashboardBookmarkGroups.id })
        .from(dashboardBookmarkGroups)
        .where(and(
          eq(dashboardBookmarkGroups.teamId, context.teamId),
          inArray(dashboardBookmarkGroups.id, groupIds),
        ))
      : [];
    const ownedItems = itemIds.length
      ? await db.select({ id: dashboardBookmarkItems.id })
        .from(dashboardBookmarkItems)
        .where(and(
          eq(dashboardBookmarkItems.teamId, context.teamId),
          inArray(dashboardBookmarkItems.id, itemIds),
        ))
      : [];
    if (ownedGroups.length !== new Set(groupIds).size || ownedItems.length !== new Set(itemIds).size) {
      return NextResponse.json({ error: 'Invalid bookmark order' }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      for (const group of input.groups) {
        for (const [order, itemId] of group.itemIds.entries()) {
          await tx.update(dashboardBookmarkItems)
            .set({ groupId: group.groupId, order, updatedAt: new Date() })
            .where(and(
              eq(dashboardBookmarkItems.id, itemId),
              eq(dashboardBookmarkItems.teamId, context.teamId),
            ));
        }
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[dashboard/bookmarks POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
