import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { getBatch } from '@/lib/plugins/sales-ops/server/queue';
import { queueErrorResponse } from '../errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { batchId } = await params;
  try {
    return NextResponse.json(await getBatch(ctx.team.id, batchId));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
