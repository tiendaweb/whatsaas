import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { cierreSemanal } from '@/lib/plugins/sales-ops/server/cierre';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Los seis números de cierre. `?dias=` para mirar otra ventana (default 7). */
export async function GET(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const dias = Number(new URL(request.url).searchParams.get('dias') ?? 7);
  return NextResponse.json(await cierreSemanal(ctx.team.id, Number.isFinite(dias) ? dias : 7));
}
