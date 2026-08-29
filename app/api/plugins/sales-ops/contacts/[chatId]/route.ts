import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { getAnalysisDetail } from '@/lib/plugins/sales-ops/server/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ chatId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });

  // Un chat de otro equipo cae acá: 404, no 403 (un 403 confirmaría que existe).
  const payload = await getAnalysisDetail(ctx.team.id, chatId);
  if (!payload) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json(payload);
}
