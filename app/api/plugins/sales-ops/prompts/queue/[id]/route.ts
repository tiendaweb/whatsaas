import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { LaunchError, approveRun, completePromptRun, deletePromptRun, editQueuedRun } from '@/lib/plugins/sales-ops/server/prompt-queue';

export const dynamic = 'force-dynamic';

const schema = z.union([
  z.object({ approved: z.literal(true) }),
  z.object({ text: z.string().max(20000).optional(), title: z.string().max(160).optional() }).refine((v) => v.text !== undefined || v.title !== undefined, { message: 'text o title' }),
  z.object({
    status: z.enum(['in_progress', 'completed', 'failed', 'blocked', 'cancelled']),
    summary: z.string().max(4000).nullable().optional(),
    output: z.string().max(60000).nullable().optional(),
  }),
]);

/** PATCH { status, summary? } → cierra o cancela. PATCH { approved: true } → la aprueba para el conector. PATCH { text?, title? } → la edita mientras espera en revisión. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  try {
    if ('approved' in parsed.data) return NextResponse.json(await approveRun(ctx.team.id, ctx.user.id, runId));
    if (!('status' in parsed.data)) return NextResponse.json(await editQueuedRun(ctx.team.id, ctx.user.id, runId, parsed.data));
    return NextResponse.json(await completePromptRun(ctx.team.id, ctx.user.id, runId, { ...parsed.data, connector: 'manual' }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

/** DELETE → elimina una corrida descartada (cancelada, fallida o bloqueada). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const runId = Number((await params).id);
  if (!Number.isInteger(runId) || runId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    return NextResponse.json(await deletePromptRun(ctx.team.id, ctx.user.id, runId));
  } catch (error) {
    const status = error instanceof LaunchError ? 422 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status });
  }
}
