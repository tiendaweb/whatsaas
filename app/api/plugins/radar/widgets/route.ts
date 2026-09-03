import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { listRadarWidgets, upsertRadarWidget } from '@/lib/plugins/radar/server/widgets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const contactIdParam = searchParams.get('contactId');
    let contactId: number | undefined;
    if (contactIdParam) {
      contactId = Number(contactIdParam);
      if (!Number.isInteger(contactId) || contactId <= 0) {
        return NextResponse.json({ error: 'contactId inválido' }, { status: 400 });
      }
    }

    const widgets = await listRadarWidgets({
      teamId: permCtx.teamId,
      section: searchParams.get('section') ?? undefined,
      surface: searchParams.get('surface') ?? undefined,
      contactId,
    });

    return NextResponse.json({ widgets });
  } catch (error) {
    console.error('Error listing Radar widgets:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    let widget;
    try {
      widget = await upsertRadarWidget({
        teamId: permCtx.teamId,
        userId: permCtx.userId,
        // Creado desde el panel: se marca 'user' para distinguirlo de lo que
        // genera la IA por MCP y no pisarlo en una regeneración automática.
        source: 'user',
        input: body,
      });
    } catch (validationError) {
      return NextResponse.json(
        { error: validationError instanceof Error ? validationError.message : 'Widget inválido' },
        { status: 400 },
      );
    }

    return NextResponse.json({ widget });
  } catch (error) {
    console.error('Error saving Radar widget:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
