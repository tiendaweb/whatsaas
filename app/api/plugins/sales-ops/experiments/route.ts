import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { createExperiment, listExperiments } from '@/lib/plugins/sales-ops/server/experiments';
import { EXPERIMENT_STATUSES, GATES } from '@/lib/plugins/sales-ops/shared/taxonomy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  hypothesis: z.string().trim().max(2000).nullable().optional(),
  segmentGates: z.array(z.enum(GATES)).optional(),
  messageA: z.string().max(4000).nullable().optional(),
  messageB: z.string().max(4000).nullable().optional(),
  status: z.enum(EXPERIMENT_STATUSES).optional(),
});

export async function GET(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const status = new URL(request.url).searchParams.get('status');
  try {
    const experiments = await listExperiments(ctx.team.id, {
      status: status && (EXPERIMENT_STATUSES as readonly string[]).includes(status) ? (status as (typeof EXPERIMENT_STATUSES)[number]) : undefined,
    });
    return NextResponse.json({ experiments });
  } catch (error) {
    console.error('[sales-ops/experiments] error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos del experimento inválidos.' }, { status: 400 });
  try {
    const experiment = await createExperiment(ctx.team.id, { ...parsed.data, createdBy: ctx.user.id });
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 400 });
  }
}
