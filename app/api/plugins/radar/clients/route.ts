import { NextRequest, NextResponse } from 'next/server';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { listRadarClients } from '@/lib/plugins/radar/server/board';

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
    const result = await listRadarClients(permCtx.teamId, {
      q: searchParams.get('q') ?? undefined,
      onlyWithReports: searchParams.get('onlyWithReports') === '1',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing Radar clients:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
