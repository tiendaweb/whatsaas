import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { duplicateRadarWidget, listRadarWidgets } from '@/lib/plugins/radar/server/widgets';

export const dynamic = 'force-dynamic';

/** Banco de widgets: los archivados del equipo, el último archivado primero. */
export async function GET() {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const widgets = await listRadarWidgets({
      teamId: permCtx.teamId,
      onlyArchived: true,
      // En el banco entran también los que estaban ocultos: seguían existiendo.
      includeDisabled: true,
    });

    return NextResponse.json({ widgets });
  } catch (error) {
    console.error('Error listing Radar widget bank:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Duplica un widget del banco como widget activo con otra key. */
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

    const { key, newKey, title, section } = body as {
      key?: unknown; newKey?: unknown; title?: unknown; section?: unknown;
    };
    if (typeof key !== 'string' || !key.trim()) return NextResponse.json({ error: 'key inválida' }, { status: 400 });
    if (typeof newKey !== 'string' || !newKey.trim()) return NextResponse.json({ error: 'newKey inválida' }, { status: 400 });

    try {
      const widget = await duplicateRadarWidget({
        teamId: permCtx.teamId,
        userId: permCtx.userId,
        key: key.trim(),
        newKey: newKey.trim(),
        ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}),
        ...(typeof section === 'string' ? { section } : {}),
      });
      return NextResponse.json({ widget });
    } catch (validationError) {
      return NextResponse.json(
        { error: validationError instanceof Error ? validationError.message : 'No se pudo duplicar el widget' },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error('Error duplicating Radar widget:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
