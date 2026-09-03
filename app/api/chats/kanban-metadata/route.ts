import { NextResponse } from 'next/server';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  departmentMembers,
  teamCustomerContacts,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
} from '@/lib/db/schema';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ContactMetadata = {
  customerIds: number[];
  companyIds: number[];
  projects: Array<{ id: number; name: string }>;
};

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
}

export async function GET() {
  try {
    const permissionContext = await getUserPermissionContext();
    if (!permissionContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { teamId, userId, permissions, canSeeAllChats, chatVisibility } = permissionContext;
    const activePlugins = await resolveActivePluginsForTeam(teamId, userId);
    const activePluginIds = new Set(activePlugins.map((plugin) => plugin.pluginId));
    const capabilities = {
      customers: activePluginIds.has('customers') && permissions.customersRead,
      memberships: activePluginIds.has('memberships') && permissions.membershipsRead,
      tasks: activePluginIds.has('tasks') && permissions.tasksRead,
    };

    const visibleChats = await db.query.chats.findMany({
      where: eq(chats.teamId, teamId),
      columns: { id: true },
      with: {
        contact: {
          columns: {
            id: true,
            assignedUserId: true,
            assignedDepartmentId: true,
          },
        },
      },
    });

    let departmentIds = new Set<number>();
    if (!canSeeAllChats && chatVisibility === 'department') {
      const memberships = await db.query.departmentMembers.findMany({
        where: eq(departmentMembers.userId, userId),
        columns: { departmentId: true },
      });
      departmentIds = new Set(memberships.map((membership) => membership.departmentId));
    }

    const contactIds = visibleChats
      .filter((chat) => {
        if (!chat.contact) return false;
        if (canSeeAllChats) return true;
        if (chat.contact.assignedUserId === userId) return true;
        return chatVisibility === 'department'
          && chat.contact.assignedDepartmentId != null
          && departmentIds.has(chat.contact.assignedDepartmentId);
      })
      .map((chat) => chat.contact!.id);

    const metadata = Object.fromEntries(
      contactIds.map((contactId) => [contactId, { customerIds: [], companyIds: [], projects: [] } satisfies ContactMetadata]),
    ) as Record<number, ContactMetadata>;

    if (contactIds.length === 0 || (!capabilities.customers && !capabilities.memberships && !capabilities.tasks)) {
      return NextResponse.json({ capabilities, companies: [], metadata });
    }

    const customerLinks = capabilities.customers || capabilities.memberships || capabilities.tasks
      ? await db
          .select({ contactId: teamCustomerContacts.contactId, customerId: teamCustomerContacts.customerId })
          .from(teamCustomerContacts)
          .where(and(eq(teamCustomerContacts.teamId, teamId), inArray(teamCustomerContacts.contactId, contactIds)))
      : [];

    const contactIdsByCustomer = new Map<number, number[]>();
    for (const link of customerLinks) {
      metadata[link.contactId]?.customerIds.push(link.customerId);
      contactIdsByCustomer.set(link.customerId, [...(contactIdsByCustomer.get(link.customerId) ?? []), link.contactId]);
    }
    const customerIds = uniqueNumbers(customerLinks.map((link) => link.customerId));

    let companies: Array<{ id: number; name: string }> = [];
    if (capabilities.memberships) {
      companies = await db
        .select({ id: teamMembershipCompanies.id, name: teamMembershipCompanies.name })
        .from(teamMembershipCompanies)
        .where(eq(teamMembershipCompanies.teamId, teamId));
      companies.sort((a, b) => a.name.localeCompare(b.name));

      const subscriptions = await db.query.teamMembershipSubscriptions.findMany({
        where: eq(teamMembershipSubscriptions.teamId, teamId),
        columns: { contactId: true, customerId: true, companyId: true },
      });

      for (const subscription of subscriptions) {
        if (!subscription.companyId) continue;
        const linkedContactIds = new Set<number>();
        if (subscription.contactId && metadata[subscription.contactId]) {
          linkedContactIds.add(subscription.contactId);
        }
        if (subscription.customerId) {
          for (const contactId of contactIdsByCustomer.get(subscription.customerId) ?? []) {
            linkedContactIds.add(contactId);
          }
        }
        for (const contactId of linkedContactIds) {
          metadata[contactId].companyIds.push(subscription.companyId);
        }
      }
    }

    if (capabilities.tasks) {
      const entityClauses = [
        and(eq(teamTaskRelations.sourceType, 'contact'), inArray(teamTaskRelations.sourceId, contactIds)),
        and(eq(teamTaskRelations.targetType, 'contact'), inArray(teamTaskRelations.targetId, contactIds)),
      ];
      if (customerIds.length > 0) {
        entityClauses.push(
          and(eq(teamTaskRelations.sourceType, 'customer'), inArray(teamTaskRelations.sourceId, customerIds)),
          and(eq(teamTaskRelations.targetType, 'customer'), inArray(teamTaskRelations.targetId, customerIds)),
        );
      }

      const relations = await db.query.teamTaskRelations.findMany({
        where: and(eq(teamTaskRelations.teamId, teamId), or(...entityClauses)),
        columns: { sourceType: true, sourceId: true, targetType: true, targetId: true },
      });

      const taskIds = uniqueNumbers(relations.flatMap((relation) => {
        if (relation.sourceType === 'task') return [relation.sourceId];
        if (relation.targetType === 'task') return [relation.targetId];
        return [];
      }));
      const taskRows = taskIds.length > 0
        ? await db
            .select({ id: teamTaskItems.id, projectId: teamTaskItems.projectId })
            .from(teamTaskItems)
            .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.id, taskIds)))
        : [];
      const projectIdByTask = new Map(taskRows.map((task) => [task.id, task.projectId]));
      const projectIds = uniqueNumbers(relations.flatMap((relation) => {
        if (relation.sourceType === 'project') return [relation.sourceId];
        if (relation.targetType === 'project') return [relation.targetId];
        if (relation.sourceType === 'task') return [projectIdByTask.get(relation.sourceId)].filter((id): id is number => id != null);
        if (relation.targetType === 'task') return [projectIdByTask.get(relation.targetId)].filter((id): id is number => id != null);
        return [];
      }));
      const projectRows = projectIds.length > 0
        ? await db
            .select({ id: teamTaskProjects.id, name: teamTaskProjects.name })
            .from(teamTaskProjects)
            .where(and(eq(teamTaskProjects.teamId, teamId), inArray(teamTaskProjects.id, projectIds)))
        : [];
      const projectsById = new Map(projectRows.map((project) => [project.id, project]));

      for (const relation of relations) {
        const linkedContactIds = relation.sourceType === 'contact'
          ? [relation.sourceId]
          : relation.targetType === 'contact'
            ? [relation.targetId]
            : relation.sourceType === 'customer'
              ? contactIdsByCustomer.get(relation.sourceId) ?? []
              : relation.targetType === 'customer'
                ? contactIdsByCustomer.get(relation.targetId) ?? []
                : [];
        const projectId = relation.sourceType === 'project'
          ? relation.sourceId
          : relation.targetType === 'project'
            ? relation.targetId
            : relation.sourceType === 'task'
              ? projectIdByTask.get(relation.sourceId)
              : relation.targetType === 'task'
                ? projectIdByTask.get(relation.targetId)
                : undefined;
        const project = projectId ? projectsById.get(projectId) : undefined;
        if (!project) continue;
        for (const contactId of linkedContactIds) {
          if (!metadata[contactId]) continue;
          metadata[contactId].projects.push(project);
        }
      }
    }

    for (const contactMetadata of Object.values(metadata)) {
      contactMetadata.customerIds = uniqueNumbers(contactMetadata.customerIds);
      contactMetadata.companyIds = uniqueNumbers(contactMetadata.companyIds);
      contactMetadata.projects = Array.from(new Map(contactMetadata.projects.map((project) => [project.id, project])).values());
    }

    return NextResponse.json({ capabilities, companies, metadata });
  } catch (error: any) {
    console.error('[kanban-metadata GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
