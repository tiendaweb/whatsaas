import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { getOverview } from '@/lib/plugins/sales-ops/server/overview';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const payload = await getOverview(ctx.team.id);
  return NextResponse.json(payload);
}
