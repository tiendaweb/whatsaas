import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { getRadarUserState, setRadarUserState } from '@/lib/plugins/radar/server/engine/state';
import { RADAR_ENGINE_SLUG_REGEX, radarUserStateSchema } from '@/lib/plugins/radar/shared/engine';

export const dynamic = 'force-dynamic';

/** Estado libre por usuario+app: última vista, filtros, snoozes, pins… */
export async function GET(request: NextRequest) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const app = request.nextUrl.searchParams.get('app')?.trim() || undefined;
    if (app && !RADAR_ENGINE_SLUG_REGEX.test(app)) {
      return NextResponse.json({ error: 'Slug de app inválido' }, { status: 400 });
    }

    const state = await getRadarUserState(permCtx.teamId, permCtx.userId, app);
    return NextResponse.json({ state: state ?? {} });
  } catch (error) {
    console.error('Error reading Radar user state:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

    const { app, state, replace } = body as { app?: unknown; state?: unknown; replace?: unknown };

    const appSlug = typeof app === 'string' && app.trim() !== '' ? app.trim() : undefined;
    if (appSlug && !RADAR_ENGINE_SLUG_REGEX.test(appSlug)) {
      return NextResponse.json({ error: 'Slug de app inválido' }, { status: 400 });
    }

    const parsed = radarUserStateSchema.safeParse(state);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Falta "state" con el estado a guardar' }, { status: 400 });
    }

    const next = await setRadarUserState({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
      appSlug,
      patch: parsed.data,
      replace: replace === true,
    });

    return NextResponse.json({ state: next ?? {} });
  } catch (error) {
    console.error('Error saving Radar user state:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
