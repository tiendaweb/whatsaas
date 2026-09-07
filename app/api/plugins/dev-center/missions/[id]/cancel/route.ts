import { NextRequest, NextResponse } from 'next/server';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { cancelMission } from '@/lib/plugins/dev-center/server/missions';

export const dynamic = 'force-dynamic';

/** Cancela la misión y, si estaba en la cola del conector, también la corrida. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId) || missionId <= 0) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  try {
    return NextResponse.json({ mission: await cancelMission(p.teamId, p.user.id, missionId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cancelar la misión.';
    return NextResponse.json({ error: message }, { status: message.includes('No existe') ? 404 : 409 });
  }
}
