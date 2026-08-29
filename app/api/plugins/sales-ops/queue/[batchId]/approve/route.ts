import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { approveBatch } from '@/lib/plugins/sales-ops/server/queue';
import { queueErrorResponse } from '../../errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const schema = z.object({ excludeActionIds: z.array(z.number().int().positive()).max(5000).optional() });

/** Aprobar NO envía: pasa a `approved` con `approved_by`. La ejecución es por conector o manual hasta la Fase 6. */
export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { batchId } = await params;
  const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    return NextResponse.json(await approveBatch(ctx.team.id, ctx.user.id, batchId, parsed.data));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
