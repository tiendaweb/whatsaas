import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { LaunchError, relaunchRun } from '@/lib/plugins/sales-ops/server/prompt-queue';

export const dynamic = 'force-dynamic';
/** Con `mode: "api"` la corrida se ejecuta dentro del request. */
export const maxDuration = 120;

/**
 * POST → repite una corrida en la cola de conectores.
 *
 * Es lo que se ofrece cuando una corrida por API falló por cuota: el prompt
 * estaba bien, lo que faltó fueron tokens del equipo. Un conector la ejecuta
 * con su propia cuota.
 *
 * Se relanza con el **texto ya resuelto** de la corrida original en lugar de
 * re-renderizar la skill: si alguien editó la skill en el medio, lo que se
 * encola sigue siendo lo que la persona quiso ejecutar.
 *
 * Body opcional `{ mode: "queue" | "api" }`. `api` es el botón "Reintentar
 * ahora": vuelve a correrla con la IA del equipo en el momento y devuelve el
 * resultado en la misma respuesta. Sin body, a la cola.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const runId = Number((await params).id);
  if (!Number.isInteger(runId) || runId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const mode: 'queue' | 'api' = body?.mode === 'api' ? 'api' : 'queue';

  try {
    const { run } = await relaunchRun(ctx.team.id, ctx.user.id, runId, mode);
    return NextResponse.json({ run, from: runId }, { status: 201 });
  } catch (error) {
    if (error instanceof LaunchError) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
