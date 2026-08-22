import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { contacts } from '@/lib/db/schema';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { listRadarReports, type RadarReportCategory } from '@/lib/plugins/radar/server/reports';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES: RadarReportCategory[] = ['clientes', 'equipo', 'generales'];

export async function GET(request: NextRequest) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get('category') ?? 'generales';
    if (!VALID_CATEGORIES.includes(categoryParam as RadarReportCategory)) {
      return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 });
    }
    const category = categoryParam as RadarReportCategory;

    const contactIdParam = searchParams.get('contactId');
    let contactId: number | undefined;
    let contactName: string | undefined;

    if (contactIdParam) {
      contactId = Number(contactIdParam);
      if (!Number.isInteger(contactId) || contactId <= 0) {
        return NextResponse.json({ error: 'contactId inválido' }, { status: 400 });
      }

      const contact = await db.query.contacts.findFirst({
        where: and(eq(contacts.id, contactId), eq(contacts.teamId, permCtx.teamId)),
        columns: { id: true, name: true, assignedUserId: true, assignedDepartmentId: true },
      });
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

      const allowed = permCtx.canSeeAllChats || contact.assignedUserId === permCtx.userId;
      if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

      contactName = contact.name ?? undefined;
    }

    const reports = await listRadarReports({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
      category,
      contactId,
      contactName,
    });

    return NextResponse.json({ category, contactId: contactId ?? null, reports });
  } catch (error) {
    console.error('Error listing Radar reports:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
