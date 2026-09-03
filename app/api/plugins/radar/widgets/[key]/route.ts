import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import {
  archiveRadarWidget,
  patchRadarWidget,
  purgeRadarWidget,
  restoreRadarWidget,
} from '@/lib/plugins/radar/server/widgets';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { key } = await params;
    if (!key?.trim()) return NextResponse.json({ error: 'key inválida' }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    // Acciones del banco. Van por `action` para no chocar con el PATCH de
    // campos (size/position/enabled/title/blocks), que sigue igual que antes.
    const action = typeof (body as { action?: unknown }).action === 'string'
      ? (body as { action: string }).action
      : null;

    if (action === 'restore') {
      const section = typeof (body as { section?: unknown }).section === 'string'
        ? (body as { section: string }).section
        : undefined;
      const widget = await restoreRadarWidget({ teamId: permCtx.teamId, key: key.trim(), section });
      if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
      return NextResponse.json({ widget, restored: true });
    }

    if (action === 'archive') {
      const widget = await archiveRadarWidget({ teamId: permCtx.teamId, userId: permCtx.userId, key: key.trim() });
      if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
      return NextResponse.json({ widget, archived: true });
    }

    const widget = await patchRadarWidget({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
      key: key.trim(),
      fields: body,
    });
    if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });

    return NextResponse.json({ widget });
  } catch (error) {
    console.error('Error patching Radar widget:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Por defecto NO borra: manda el widget al banco, de donde se puede restaurar,
 * duplicar o borrar definitivamente. `?permanent=1` es el borrado físico.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { key } = await params;
    if (!key?.trim()) return NextResponse.json({ error: 'key inválida' }, { status: 400 });

    const permanent = new URL(request.url).searchParams.get('permanent');
    const isPermanent = permanent === '1' || permanent === 'true';

    if (isPermanent) {
      const purged = await purgeRadarWidget({ teamId: permCtx.teamId, key: key.trim() });
      if (!purged) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
      return NextResponse.json({ ok: true, purged: true });
    }

    const widget = await archiveRadarWidget({ teamId: permCtx.teamId, userId: permCtx.userId, key: key.trim() });
    if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });

    return NextResponse.json({ ok: true, archived: true, widget });
  } catch (error) {
    console.error('Error archiving Radar widget:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
