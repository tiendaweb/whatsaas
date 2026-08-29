import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { completePromptRun } from '@/lib/plugins/sales-ops/server/prompt-queue';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['in_progress', 'completed', 'failed', 'blocked', 'cancelled']),
  summary: z.string().max(4000).nullable().optional(),
});

/** PATCH { status, summary? } → cierra o cancela una corrida desde la interfaz. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  try {
    return NextResponse.json(await completePromptRun(ctx.team.id, ctx.user.id, runId, { ...parsed.data, connector: 'manual' }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
