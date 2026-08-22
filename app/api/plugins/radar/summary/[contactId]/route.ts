import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, like } from 'drizzle-orm';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { contacts, departmentMembers, messages } from '@/lib/db/schema';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { listContactTasks } from '@/lib/plugins/tasks/server/contact-tasks';
import { RADAR_ANALYST_FIELD_KEYS } from '@/lib/plugins/radar/shared/constants';

export const dynamic = 'force-dynamic';

const RADAR_NOTE_PREFIX = '🎯 RADAR';

async function userCanAccessContact(
  contactId: number,
  permCtx: NonNullable<Awaited<ReturnType<typeof getUserPermissionContext>>>,
) {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, permCtx.teamId)),
    columns: {
      id: true,
      chatId: true,
      name: true,
      customData: true,
      assignedUserId: true,
      assignedDepartmentId: true,
    },
  });

  if (!contact) return { contact: null, allowed: false as const };
  if (permCtx.canSeeAllChats) return { contact, allowed: true as const };
  if (contact.assignedUserId === permCtx.userId) return { contact, allowed: true as const };

  if (permCtx.chatVisibility === 'department' && contact.assignedDepartmentId) {
    const memberships = await db.query.departmentMembers.findMany({
      where: eq(departmentMembers.userId, permCtx.userId),
      columns: { departmentId: true },
    });
    const departmentIds = memberships.map((m) => m.departmentId);
    return { contact, allowed: departmentIds.includes(contact.assignedDepartmentId) };
  }

  return { contact, allowed: false as const };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { contactId: contactIdParam } = await params;
    const contactId = Number(contactIdParam);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });
    }

    const { contact, allowed } = await userCanAccessContact(contactId, permCtx);
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const customData = (contact.customData ?? {}) as Record<string, unknown>;
    const fields: Record<string, string | null> = {};
    for (const key of RADAR_ANALYST_FIELD_KEYS) {
      const value = customData[key];
      fields[key] = typeof value === 'string' && value.trim() ? value.trim() : null;
    }

    const analyzed = Boolean(fields.radar_fecha_analisis);

    // La nota interna 🎯 RADAR más reciente vive como mensaje sintético
    // (isInternal=true) en el chat del contacto, no en una tabla aparte.
    const [note, tasks] = await Promise.all([
      analyzed
        ? db.query.messages.findFirst({
            where: and(
              eq(messages.chatId, contact.chatId),
              eq(messages.isInternal, true),
              like(messages.text, `${RADAR_NOTE_PREFIX}%`),
            ),
            orderBy: [desc(messages.timestamp)],
            columns: { text: true, timestamp: true },
          })
        : Promise.resolve(null),
      listContactTasks(permCtx.teamId, contactId),
    ]);

    return NextResponse.json({
      analyzed,
      contact: { id: contact.id, name: contact.name },
      fields,
      note: note ? { text: note.text, date: note.timestamp } : null,
      tasks: tasks
        .filter((task) => task.status !== 'done')
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          dueDate: task.dueDate,
          projectName: task.projectName,
        })),
    });
  } catch (error) {
    console.error('Error building Radar summary:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
