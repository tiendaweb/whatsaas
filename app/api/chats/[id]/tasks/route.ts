import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserPermissionContext, type PermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { chats, departmentMembers } from '@/lib/db/schema';
import { hasPermission } from '@/lib/permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import {
  createContactTask,
  listContactTasks,
  updateContactTaskAi,
  updateContactTaskStatus,
} from '@/lib/plugins/tasks/server/contact-tasks';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(10_000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
});

const updateSchema = z.object({
  taskId: z.number().int().positive(),
  status: z.enum(['open', 'in_progress', 'done']),
});

/** El panel del chat también arma la tarea para los conectores y contesta su pregunta. */
const aiUpdateSchema = z.object({
  taskId: z.number().int().positive(),
  aiReady: z.boolean().optional(),
  aiPrompt: z.string().max(20000).optional(),
  aiNextStep: z.string().max(20000).optional(),
  aiContextAnswer: z.string().max(20000).optional(),
}).refine(
  (value) => value.aiReady !== undefined
    || value.aiPrompt !== undefined
    || value.aiNextStep !== undefined
    || value.aiContextAnswer !== undefined,
  { message: 'empty_patch' },
);

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

async function findAccessibleChat(chatId: number, context: PermissionContext) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, context.teamId)),
    with: {
      contact: {
        columns: { id: true, assignedUserId: true, assignedDepartmentId: true },
      },
    },
  });
  if (!chat) return null;
  if (context.canSeeAllChats) return chat;
  if (chat.contact?.assignedUserId === context.userId) return chat;
  if (context.chatVisibility !== 'department' || !chat.contact?.assignedDepartmentId) return null;

  const membership = await db.query.departmentMembers.findFirst({
    where: and(
      eq(departmentMembers.userId, context.userId),
      eq(departmentMembers.departmentId, chat.contact.assignedDepartmentId),
    ),
    columns: { departmentId: true },
  });
  return membership ? chat : null;
}

function parseChatId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await getContext('tasksRead');
  if ('response' in result) return result.response;
  const { id } = await params;
  const chatId = parseChatId(id);
  if (!chatId) return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });

  const chat = await findAccessibleChat(chatId, result.context);
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  const contactId = chat.contact?.id ?? null;
  const tasks = contactId ? await listContactTasks(result.context.teamId, contactId) : [];
  return NextResponse.json({ enabled: true, contactId, tasks });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await getContext('tasksWrite');
  if ('response' in result) return result.response;
  const { id } = await params;
  const chatId = parseChatId(id);
  if (!chatId) return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });

  const chat = await findAccessibleChat(chatId, result.context);
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  if (!chat.contact) return NextResponse.json({ error: 'contact_required' }, { status: 409 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid task', details: parsed.error.flatten() }, { status: 400 });
  const created = await createContactTask({
    teamId: result.context.teamId,
    userId: result.context.userId,
    contactId: chat.contact.id,
    title: parsed.data.title,
    notes: parsed.data.notes,
    dueDate: parsed.data.dueDate,
    status: parsed.data.status,
  });
  if ('error' in created) return NextResponse.json({ error: created.error }, { status: 500 });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await getContext('tasksWrite');
  if ('response' in result) return result.response;
  const { id } = await params;
  const chatId = parseChatId(id);
  if (!chatId) return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });

  const chat = await findAccessibleChat(chatId, result.context);
  if (!chat?.contact) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const ai = aiUpdateSchema.safeParse(body);
    if (!ai.success) return NextResponse.json({ error: 'Invalid task update' }, { status: 400 });
    const patched = await updateContactTaskAi({
      teamId: result.context.teamId,
      contactId: chat.contact.id,
      taskId: ai.data.taskId,
      aiReady: ai.data.aiReady,
      aiPrompt: ai.data.aiPrompt,
      aiNextStep: ai.data.aiNextStep,
      aiContextAnswer: ai.data.aiContextAnswer,
    });
    if ('error' in patched) {
      return NextResponse.json(
        { error: patched.error },
        { status: patched.error === 'prompt_required' ? 409 : 404 },
      );
    }
    return NextResponse.json(patched);
  }

  const updated = await updateContactTaskStatus({
    teamId: result.context.teamId,
    contactId: chat.contact.id,
    taskId: parsed.data.taskId,
    status: parsed.data.status,
  });
  if ('error' in updated) return NextResponse.json({ error: updated.error }, { status: 404 });
  return NextResponse.json(updated);
}
