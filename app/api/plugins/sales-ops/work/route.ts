import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listWorkQueue, WORK_KINDS, type WorkKind } from '@/lib/plugins/sales-ops/server/work-queue';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { searchParams } = new URL(req.url);
  const kinds = (searchParams.get('kinds') ?? '').split(',').filter((k): k is WorkKind => (WORK_KINDS as string[]).includes(k));
  const limit = Number(searchParams.get('limit') ?? 30);
  const payload = await listWorkQueue(ctx.team.id, { kinds, limit: Number.isFinite(limit) ? limit : 30 });
  return NextResponse.json(payload);
}
