import { NextResponse } from 'next/server';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financeOsMovimientos } from '@/lib/plugins/finance/server/os';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const p = new URL(request.url).searchParams;
  const type = p.get('type');
  return NextResponse.json(
    await financeOsMovimientos(ctx.team.id, {
      type: type === 'income' || type === 'expense' ? type : undefined,
      status: p.get('status') ?? undefined,
      currency: p.get('currency') ?? undefined,
      category: p.get('category') ?? undefined,
      q: p.get('q') ?? undefined,
      month: p.get('month') ?? undefined,
      page: Number(p.get('page')) || undefined,
      perPage: Number(p.get('perPage')) || undefined,
    }),
  );
}
