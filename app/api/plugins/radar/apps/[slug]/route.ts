import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { getRadarApp } from '@/lib/plugins/radar/server/engine/apps';
import { resolveRadarView } from '@/lib/plugins/radar/server/engine/resolve';
import { parseRadarAppContext } from '@/lib/plugins/radar/shared/app-link';

export const dynamic = 'force-dynamic';

/**
 * Resuelve UNA vista de una app del engine: ejecuta datasources y métricas del
 * lado del servidor y devuelve bloques ya materializados, listos para dibujar.
 * Query: `view` (slug de la vista; sin eso, la default) y `draft=1` para ver
 * el borrador en vez de la definición publicada.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const record = await getRadarApp(permCtx.teamId, slug);
    if (!record || record.status === 'archived') {
      return NextResponse.json({ error: 'App no encontrada' }, { status: 404 });
    }

    const draft = request.nextUrl.searchParams.get('draft') === '1';
    // El usuario final ve la definición congelada al publicar; el borrador sólo
    // sale con `draft=1` o cuando la app nunca se publicó.
    const definition = draft ? record.definition : (record.publishedDefinition ?? record.definition);

    const allowed = definition.visibility?.userIds;
    if (allowed?.length && !allowed.includes(permCtx.userId)) {
      return NextResponse.json({ error: 'No tenés acceso a esta app' }, { status: 403 });
    }

    const viewSlug = request.nextUrl.searchParams.get('view')?.trim() || undefined;
    const rawContext = request.nextUrl.searchParams.get('context');
    const context = parseRadarAppContext(rawContext);
    if (context === null) {
      return NextResponse.json({ error: 'Contexto de app inválido' }, { status: 400 });
    }
    const { view, navigation, defaultView } = await resolveRadarView({
      teamId: permCtx.teamId,
      userId: permCtx.userId,
      definition,
      viewSlug,
    });

    return NextResponse.json({
      app: {
        slug: record.slug,
        name: record.name,
        icon: record.icon,
        tone: record.tone,
        status: record.status,
        version: record.version,
        publishedVersion: record.publishedVersion,
        theme: definition.theme ?? null,
      },
      navigation,
      defaultView,
      context,
      view,
    });
  } catch (error) {
    console.error('Error resolving Radar engine app view:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
