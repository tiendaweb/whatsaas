import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { convertirProgramadoEnPedido } from '@/lib/plugins/sales-ops/server/programados';

export const dynamic = 'force-dynamic';

/**
 * POST { prompt? } → convierte un programado en una indicación en la cola y lo
 * borra de Programados. El conector decide después si el resultado es un
 * mensaje, una demo o un proyecto.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  try {
    const result = await convertirProgramadoEnPedido(ctx.team.id, ctx.user.id, id, { prompt: typeof body?.prompt === 'string' ? body.prompt : undefined });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
