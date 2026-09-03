import { NextResponse } from 'next/server';

import { getRadarTarget } from '@/lib/plugins/radar/server/access';
import { getRadarOverview } from '@/lib/plugins/radar/server/board';

export const dynamic = 'force-dynamic';

export async function GET() {
  const target = await getRadarTarget();
  if (!target) {
    return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
  }

  const overview = await getRadarOverview(target.teamId);
  return NextResponse.json(overview);
}
