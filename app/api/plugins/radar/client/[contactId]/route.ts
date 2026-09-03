import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget, userCanAccessContact } from '@/lib/plugins/radar/server/access';
import { getRadarClientPanel } from '@/lib/plugins/radar/server/board';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
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

    const panel = await getRadarClientPanel({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
      contact,
    });

    return NextResponse.json(panel);
  } catch (error) {
    console.error('Error building Radar client panel:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
