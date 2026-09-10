import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { rejectBatch } from '@/lib/plugins/sales-ops/server/queue';
import { REJECT_REASONS } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { queueErrorResponse } from '../../errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const schema = z.object({
  reason: z.string().trim().max(300).optional(),
  /** Motivo tipado: es lo que se cuenta y lo que vuelve al prompt de quien redacta. */
  code: z.enum(REJECT_REASONS).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { batchId } = await params;
  const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    return NextResponse.json(await rejectBatch(ctx.team.id, ctx.user.id, batchId, parsed.data.reason, parsed.data.code));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
