import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { getRadarApp, listRadarApps } from '@/lib/plugins/radar/server/engine/apps';
import type { RadarAppDefinition, RadarAppRecord } from '@/lib/plugins/radar/shared/engine';

export const dynamic = 'force-dynamic';

/**
 * Definición efectiva para el usuario final: la publicada si existe; si la app
 * nunca se publicó (o se piden borradores) se cae al borrador actual.
 */
function effectiveDefinition(record: RadarAppRecord, drafts: boolean): RadarAppDefinition {
  if (drafts) return record.definition;
  return record.publishedDefinition ?? record.definition;
}

/** La visibilidad restringe SOLO cuando declara userIds; sin eso ven todos. */
function canSee(definition: RadarAppDefinition, userId: number): boolean {
  const allowed = definition.visibility?.userIds;
  if (!allowed?.length) return true;
  return allowed.includes(userId);
}

/**
 * Lista las apps del engine que este usuario puede abrir. Por defecto sólo las
 * publicadas; con `?drafts=1` también los borradores (para quien está armando
 * la app y quiere verla antes de publicar).
 */
export async function GET(request: NextRequest) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const drafts = request.nextUrl.searchParams.get('drafts') === '1';

    const summaries = await listRadarApps(permCtx.teamId);
    const candidates = summaries.filter((summary) =>
      summary.status === 'published' || (drafts && summary.status === 'draft'),
    );

    // La summary no trae visibility (vive dentro de la definición), así que se
    // traen los records en paralelo. Son ≤20 apps por equipo: no duele.
    const records = await Promise.all(
      candidates.map((summary) => getRadarApp(permCtx.teamId, summary.slug)),
    );

    const apps = records
      .filter((record): record is RadarAppRecord => record !== null)
      .filter((record) => canSee(effectiveDefinition(record, drafts), permCtx.userId))
      .map((record) => {
        const definition = effectiveDefinition(record, drafts);
        return {
          slug: record.slug,
          name: record.name,
          icon: record.icon,
          tone: record.tone,
          status: record.status,
          version: record.version,
          publishedVersion: record.publishedVersion,
          updatedAt: record.updatedAt,
          description: definition.description ?? null,
        };
      });

    return NextResponse.json({ apps });
  } catch (error) {
    console.error('Error listing Radar engine apps:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
