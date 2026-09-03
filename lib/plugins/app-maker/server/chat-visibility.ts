import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, departmentMembers } from '@/lib/db/schema';
import { canSeeAllChats, getChatVisibility, type MemberPermissions } from '@/lib/permissions';

type VisibilityContext = {
  teamId: number;
  userId: number;
  role: string;
  permissions?: MemberPermissions | null;
};

const CHAT_SCOPED_RESOURCES = new Set(['contacts', 'chats', 'messages', 'message-reactions', 'ai-sessions']);

function visibleAssignment(input: { assignedUserId: number | null; assignedDepartmentId: number | null }, context: VisibilityContext, departments: Set<number>) {
  if (input.assignedUserId === context.userId) return true;
  return getChatVisibility(context.role, context.permissions) === 'department'
    && input.assignedDepartmentId !== null
    && departments.has(input.assignedDepartmentId);
}

export async function filterAppMakerChatRows(resourceKey: string, rows: Array<Record<string, unknown>>, context: VisibilityContext) {
  if (!CHAT_SCOPED_RESOURCES.has(resourceKey) || canSeeAllChats(context.role, context.permissions) || !rows.length) return rows;
  const departmentRows = getChatVisibility(context.role, context.permissions) === 'department'
    ? await db.select({ departmentId: departmentMembers.departmentId }).from(departmentMembers).where(eq(departmentMembers.userId, context.userId))
    : [];
  const departments = new Set(departmentRows.map((row) => row.departmentId));
  if (resourceKey === 'contacts') {
    return rows.filter((row) => visibleAssignment({
      assignedUserId: Number.isInteger(Number(row.assignedUserId)) ? Number(row.assignedUserId) : null,
      assignedDepartmentId: Number.isInteger(Number(row.assignedDepartmentId)) ? Number(row.assignedDepartmentId) : null,
    }, context, departments));
  }
  const chatIds = [...new Set(rows.map((row) => Number(resourceKey === 'chats' ? row.id : row.chatId)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!chatIds.length) return [];
  const assignments = await db.select({ chatId: contacts.chatId, assignedUserId: contacts.assignedUserId, assignedDepartmentId: contacts.assignedDepartmentId }).from(contacts).where(and(
    eq(contacts.teamId, context.teamId),
    inArray(contacts.chatId, chatIds),
  ));
  const visibleChats = new Set(assignments.filter((row) => visibleAssignment(row, context, departments)).map((row) => row.chatId));
  return rows.filter((row) => visibleChats.has(Number(resourceKey === 'chats' ? row.id : row.chatId)));
}

export async function canReadAppMakerChatRecord(resourceKey: string, row: Record<string, unknown>, context: VisibilityContext) {
  return (await filterAppMakerChatRows(resourceKey, [row], context)).length === 1;
}
