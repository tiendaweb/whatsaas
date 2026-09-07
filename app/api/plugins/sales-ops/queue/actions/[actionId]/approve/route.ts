import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { approveAction } from '@/lib/plugins/sales-ops/server/queue';
import { queueErrorResponse } from '../../../errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  recommendation: z.string().max(4000).optional(),
  originalText: z.string().max(4000).optional(),
  aiInstruction: z.string().max(1000).optional(),
});

/** Aprueba sólo esta fila. Nunca ejecuta ni altera las demás filas del lote. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const actionId = Number((await params).actionId);
  if (!Number.isInteger(actionId) || actionId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    return NextResponse.json(await approveAction(ctx.team.id, ctx.user.id, actionId, parsed.data));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
