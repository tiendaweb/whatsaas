import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { contacts, departmentMembers } from '@/lib/db/schema';
import { listLinkedRadarReports } from '@/lib/plugins/radar/server/report-links';

export const dynamic = 'force-dynamic';

/**
 * Documentos vinculados a un contacto — hoy, los informes que Radar publica y
 * enlaza en `team_radar_reports`. Es una ruta de contactos y no de Radar a
 * propósito: la ficha completa del embudo la usa cualquier usuario del equipo,
 * no sólo quien tiene Radar habilitado. Nunca crea carpetas: sólo lee vínculos
 * que ya existen.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contactId = Number((await params).id);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });
    }

    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, contactId), eq(contacts.teamId, permCtx.teamId)),
      columns: { id: true, assignedUserId: true, assignedDepartmentId: true },
    });
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    let allowed = permCtx.canSeeAllChats || contact.assignedUserId === permCtx.userId;
    if (!allowed && permCtx.chatVisibility === 'department' && contact.assignedDepartmentId) {
      const membership = await db.query.departmentMembers.findFirst({
        where: and(
          eq(departmentMembers.userId, permCtx.userId),
          eq(departmentMembers.departmentId, contact.assignedDepartmentId),
        ),
        columns: { departmentId: true },
      });
      allowed = Boolean(membership);
    }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const linked = await listLinkedRadarReports({ teamId: permCtx.teamId, contactId });

    return NextResponse.json({
      documents: linked.map((link) => ({
        id: link.document.id,
        title: link.document.title,
        emoji: link.document.emoji,
        format: link.document.format,
        updatedAt: link.document.updatedAt,
        category: link.category,
        summary: link.summary,
      })),
    });
  } catch (error) {
    console.error('Error listing contact documents:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
