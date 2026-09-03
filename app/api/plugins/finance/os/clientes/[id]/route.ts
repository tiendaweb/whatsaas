import { NextResponse } from 'next/server';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financeOsClienteFicha } from '@/lib/plugins/finance/server/os';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { id } = await params;
  const ficha = await financeOsClienteFicha(ctx.team.id, Number(id));
  if (!ficha) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(ficha);
}
