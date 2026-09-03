import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { z } from 'zod';
import { listWorkQueue, listWorkSkips, skipWorkItem, unskipWorkItem, WORK_KINDS, type WorkKind } from '@/lib/plugins/sales-ops/server/work-queue';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { searchParams } = new URL(req.url);
  const kinds = (searchParams.get('kinds') ?? '').split(',').filter((k): k is WorkKind => (WORK_KINDS as string[]).includes(k));
  const limit = Number(searchParams.get('limit') ?? 30);
  const [payload, skips] = await Promise.all([listWorkQueue(ctx.team.id, { kinds, limit: Number.isFinite(limit) ? limit : 30 }), listWorkSkips(ctx.team.id)]);
  return NextResponse.json({ ...payload, skips });
}

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('skip'), kind: z.enum(WORK_KINDS as [WorkKind, ...WorkKind[]]), key: z.string().min(1).max(120), forever: z.boolean().optional(), label: z.string().max(120).optional() }),
  z.object({ action: z.literal('unskip'), kind: z.string().max(40), key: z.string().min(1).max(120) }),
]);

/** POST { action: 'skip', kind, key, forever?, label? } | { action: 'unskip', kind, key } → descarta o rehabilita un ítem de la cola de conectores. */
export async function POST(req: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  try {
    const skips = parsed.data.action === 'skip'
      ? await skipWorkItem(ctx.team.id, ctx.user.id, { kind: parsed.data.kind, key: parsed.data.key, forever: Boolean(parsed.data.forever), label: parsed.data.label })
      : await unskipWorkItem(ctx.team.id, ctx.user.id, parsed.data);
    return NextResponse.json({ skips });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
