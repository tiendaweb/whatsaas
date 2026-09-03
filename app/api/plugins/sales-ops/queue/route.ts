import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listBatches, proposeBatch } from '@/lib/plugins/sales-ops/server/queue';
import { queueErrorResponse } from './errors';
import { ACTION_KINDS, ACTION_ROLES, ACTION_STATUSES, ANALYSIS_STATUSES, GATES, OWNERS } from '@/lib/plugins/sales-ops/shared/taxonomy';
import type { QueueListPayload } from '@/lib/plugins/sales-ops/shared/api-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const proposeSchema = z.object({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(ACTION_KINDS),
  requiresRole: z.enum(ACTION_ROLES).default('any'),
  gates: z.array(z.enum(GATES)).optional(),
  chatIds: z.array(z.number().int().positive()).max(2000).optional(),
  filters: z
    .object({
      status: z.array(z.enum(ANALYSIS_STATUSES)).optional(),
      owner: z.enum(OWNERS).optional(),
      maxFollowups: z.number().int().min(0).optional(),
      minDaysSilent: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(2000).optional(),
    })
    .optional(),
  payloadTemplate: z
    .object({
      text: z.string().max(4000).optional(),
      textB: z.string().max(4000).optional(),
      taskTitle: z.string().max(200).optional(),
      dueInDays: z.number().int().min(0).max(365).optional(),
      sendAt: z.string().max(40).optional(),
      extra: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  experimentId: z.number().int().positive().nullable().optional(),
  variantSplit: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

export async function GET(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  try {
    const batches = await listBatches(ctx.team.id, {
      status: status && (ACTION_STATUSES as readonly string[]).includes(status) ? (status as (typeof ACTION_STATUSES)[number]) : undefined,
    });
    const payload: QueueListPayload = { batches };
    return NextResponse.json(payload);
  } catch (error) {
    return queueErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = proposeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos del lote inválidos.', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }
  try {
    const result = await proposeBatch(ctx.team.id, { ...parsed.data, proposedBy: ctx.user.id });
    return NextResponse.json(result, { status: result.dryRun || !result.batchId ? 200 : 201 });
  } catch (error) {
    return queueErrorResponse(error);
  }
}
