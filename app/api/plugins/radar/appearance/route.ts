import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import {
  getRadarAppearance,
  resolveRadarSections,
  setRadarAppearance,
  type SetRadarAppearanceInput,
} from '@/lib/plugins/radar/server/appearance';
import { RADAR_SECTIONS, parseRadarAppearance } from '@/lib/plugins/radar/shared/blocks';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const appearance = await getRadarAppearance(permCtx.teamId);
    return NextResponse.json({ appearance, sections: resolveRadarSections(appearance) });
  } catch (error) {
    console.error('Error reading Radar appearance:', error);
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

    const raw = (body as { sections?: unknown }).sections;
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Falta "sections" con las secciones a cambiar' }, { status: 400 });
    }

    const cleaned = parseRadarAppearance({ sections: raw });
    const sections: SetRadarAppearanceInput['sections'] = {};
    const ignored: string[] = [];

    for (const section of RADAR_SECTIONS) {
      const candidate = (raw as Record<string, unknown>)[section];
      if (candidate === undefined) continue;

      const clean = cleaned.sections[section];
      if (clean) {
        sections[section] = clean;
        continue;
      }
      // El objeto vacío es un pedido explícito de volver al default; una
      // sección con datos pero ninguno válido se ignora en vez de borrar en
      // silencio el override que el equipo ya tenía.
      const empty =
        typeof candidate === 'object' && candidate !== null && Object.keys(candidate).length === 0;
      if (empty) sections[section] = {};
      else ignored.push(section);
    }

    if (!Object.keys(sections).length) {
      return NextResponse.json(
        { error: 'Ninguna sección válida en "sections"', ignored },
        { status: 400 },
      );
    }

    const appearance = await setRadarAppearance({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
      sections,
    });

    return NextResponse.json({
      appearance,
      sections: resolveRadarSections(appearance),
      ...(ignored.length ? { ignored } : {}),
    });
  } catch (error) {
    console.error('Error saving Radar appearance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
