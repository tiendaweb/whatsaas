import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { enqueuePromptRun, listPromptRuns, PROMPT_RUN_STATUSES } from '@/lib/plugins/sales-ops/server/prompt-queue';

export const dynamic = 'force-dynamic';

/** GET ?status=open|all|queued|… &chatId= → corridas de prompts. */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const status = sp.get('status') ?? 'open';
  const ok = status === 'open' || status === 'all' || (PROMPT_RUN_STATUSES as readonly string[]).includes(status);
  const chatId = Number(sp.get('chatId'));
  const runs = await listPromptRuns(ctx.team.id, { status: ok ? (status as never) : 'open', chatId: Number.isInteger(chatId) && chatId > 0 ? chatId : undefined, limit: 100 });
  return NextResponse.json({ runs });
}

const enqueueSchema = z.object({
  promptId: z.number().int().positive().nullable().optional(),
  text: z.string().max(20000).nullable().optional(),
  title: z.string().max(160).nullable().optional(),
  targetKind: z.enum(['chat', 'team']),
  targetId: z.number().int().positive().nullable().optional(),
});

/** POST → deja un prompt en la cola de conectores. */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = enqueueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { promptId? | text, targetKind, targetId? }' }, { status: 400 });
  try {
    return NextResponse.json(await enqueuePromptRun(ctx.team.id, ctx.user.id, parsed.data), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
