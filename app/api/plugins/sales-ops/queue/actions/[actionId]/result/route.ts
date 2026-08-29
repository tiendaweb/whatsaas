import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { markResult } from '@/lib/plugins/sales-ops/server/queue';
import { queueErrorResponse } from '../../../errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const schema = z.object({
  status: z.enum(['executed', 'failed', 'resulted']),
  resultMessageId: z.string().max(255).nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  executedVia: z.enum(['connector', 'manual', 'command-center']).optional(),
});

/** Un humano reporta desde la UI lo que hizo a mano (`manual`); el conector usa la tool `whatspro_sales_queue_result`. */
export async function POST(request: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { actionId } = await params;
  const id = Number(actionId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'actionId inválido.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    return NextResponse.json(await markResult(ctx.team.id, id, { ...parsed.data, executedVia: parsed.data.executedVia ?? 'manual', userId: ctx.user.id }));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
