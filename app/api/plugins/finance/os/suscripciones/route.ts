import { NextResponse } from 'next/server';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financeOsSuscripciones } from '@/lib/plugins/finance/server/os';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const p = new URL(request.url).searchParams;
  const companyRaw = p.get('companyId');
  return NextResponse.json(
    await financeOsSuscripciones(ctx.team.id, {
      companyId: companyRaw === null ? undefined : companyRaw === 'null' ? null : Number(companyRaw),
      status: p.get('status') ?? undefined,
      paymentStatus: p.get('paymentStatus') ?? undefined,
      q: p.get('q') ?? undefined,
      expiringDays: p.get('expiringDays') ? Number(p.get('expiringDays')) : undefined,
      page: Number(p.get('page')) || undefined,
      perPage: Number(p.get('perPage')) || undefined,
    }),
  );
}
