import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { LaunchError, launchRun, listPromptRuns, PROMPT_RUN_STATUSES } from '@/lib/plugins/sales-ops/server/prompt-queue';
import { RUN_MODES, isRunMode } from '@/lib/plugins/sales-ops/shared/skills';

export const dynamic = 'force-dynamic';

/** GET ?status=open|all|queued|… &chatId= &mode= → corridas del Prompt Studio. */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const status = sp.get('status') ?? 'open';
  const ok = status === 'open' || status === 'all' || (PROMPT_RUN_STATUSES as readonly string[]).includes(status);
  const chatId = Number(sp.get('chatId'));
  const mode = sp.get('mode');
  const runs = await listPromptRuns(ctx.team.id, {
    status: ok ? (status as never) : 'open',
    chatId: Number.isInteger(chatId) && chatId > 0 ? chatId : undefined,
    mode: isRunMode(mode) ? mode : undefined,
    promptKey: sp.get('key')?.trim() || undefined,
    engine: sp.get('engine') === 'exclude' ? 'exclude' : undefined,
    limit: Math.min(Math.max(Number(sp.get('limit')) || 100, 1), 200),
  });
  return NextResponse.json({ runs });
}

const enqueueSchema = z.object({
  promptId: z.number().int().positive().nullable().optional(),
  skillId: z.number().int().positive().nullable().optional(),
  text: z.string().max(20000).nullable().optional(),
  title: z.string().max(160).nullable().optional(),
  targetKind: z.enum(['chat', 'team', 'batch']),
  targetId: z.number().int().positive().nullable().optional(),
  targetRef: z.string().max(64).nullable().optional(),
  variables: z.record(z.string().max(60), z.string().max(4000)).optional(),
  mode: z.enum(RUN_MODES).optional(),
  /** Default true: lo escribió una persona en la ficha. false = dejarla en revisión. Misma regla que /prompts/launch. */
  approved: z.boolean().optional(),
});

/**
 * POST → deja un prompt en la cola de conectores (o lo corre por API si se pide).
 *
 * Es la ruta histórica; `/prompts/launch` hace lo mismo con el mismo
 * `launchRun` y el mismo default de `approved`. Las dos siguen porque tienen
 * clientes, pero no pueden decidir distinto.
 */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = enqueueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { skillId? | text, targetKind, targetId?, variables?, mode?, approved? }' }, { status: 400 });
  try {
    const { run } = await launchRun(ctx.team.id, ctx.user.id, { ...parsed.data, mode: parsed.data.mode ?? 'queue', approved: parsed.data.approved ?? true });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    if (error instanceof LaunchError) return NextResponse.json({ error: error.message, missing: error.missing }, { status: 422 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
