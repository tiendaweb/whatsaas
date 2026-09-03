import { NextResponse } from 'next/server';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financeOsClientes } from '@/lib/plugins/finance/server/os';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const p = new URL(request.url).searchParams;
  return NextResponse.json(
    await financeOsClientes(ctx.team.id, {
      q: p.get('q') ?? undefined,
      conDeuda: p.get('conDeuda') === '1',
      conMembresia: p.get('conMembresia') === '1',
      page: Number(p.get('page')) || undefined,
      perPage: Number(p.get('perPage')) || undefined,
    }),
  );
}
