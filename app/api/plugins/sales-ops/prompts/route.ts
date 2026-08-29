import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listTeamPrompts } from '@/lib/plugins/sales-ops/server/prompts';
import { listQuickActions, retireQuickAction, upsertQuickAction } from '@/lib/plugins/sales-ops/server/prompt-queue';

export const dynamic = 'force-dynamic';

/** GET → prompts versionados del equipo (team_prompts), defaults del motor y acciones rápidas del Prompt Studio. */
export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  try {
    const [payload, quickActions] = await Promise.all([listTeamPrompts(ctx.team.id), listQuickActions(ctx.team.id)]);
    return NextResponse.json({ ...payload, quickActions });
  } catch (error) {
    console.error('[sales-ops/prompts]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const createSchema = z.object({
  key: z.string().max(64).optional(),
  title: z.string().min(3).max(160),
  text: z.string().min(5).max(20000),
  toolChain: z.array(z.string().max(80)).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** POST → crea o versiona una acción rápida (Prompt Studio). */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { title, text, key?, toolChain?, notes? }' }, { status: 400 });
  try {
    return NextResponse.json(await upsertQuickAction(ctx.team.id, ctx.user.id, parsed.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

/** DELETE ?key= → retira todas las versiones de una acción rápida. */
export async function DELETE(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const key = new URL(request.url).searchParams.get('key')?.trim();
  if (!key) return NextResponse.json({ error: 'Falta key' }, { status: 400 });
  return NextResponse.json({ retired: await retireQuickAction(ctx.team.id, ctx.user.id, key) });
}
