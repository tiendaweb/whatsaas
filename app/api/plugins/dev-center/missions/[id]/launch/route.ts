import { NextRequest, NextResponse } from 'next/server';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { launchMissionToConnector } from '@/lib/plugins/dev-center/server/missions';

export const dynamic = 'force-dynamic';

/** Encola una misión de conector: la toma el próximo conector que pregunte por trabajo. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId) || missionId <= 0) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  try {
    return NextResponse.json({ mission: await launchMissionToConnector(p.teamId, p.user.id, missionId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo encolar la misión.';
    return NextResponse.json({ error: message }, { status: message.includes('No existe') ? 404 : 409 });
  }
}
