import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { closeExperiment } from '@/lib/plugins/sales-ops/server/experiments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { id } = await params;
  const experimentId = Number(id);
  if (!Number.isInteger(experimentId) || experimentId <= 0) return NextResponse.json({ error: 'id inválido.' }, { status: 400 });
  try {
    return NextResponse.json({ experiment: await closeExperiment(ctx.team.id, experimentId, ctx.user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 404 });
  }
}
