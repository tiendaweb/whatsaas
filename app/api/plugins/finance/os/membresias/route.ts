import { NextResponse } from 'next/server';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financeOsMembresias } from '@/lib/plugins/finance/server/os';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await financeOsMembresias(ctx.team.id));
}
