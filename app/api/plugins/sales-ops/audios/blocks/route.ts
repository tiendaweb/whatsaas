import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { assignAudioBlock, createAudioBlock, listAudioBlocks, reorderAudioBlocks, sugerirBloques } from '@/lib/plugins/sales-ops/server/audio-blocks';

export const dynamic = 'force-dynamic';

/** GET → bloques de trabajo de la cola de audios, con sus conteos. */
export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  try {
    return NextResponse.json({ bloques: await listAudioBlocks(ctx.team.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().min(2).max(120),
    description: z.string().max(2000).optional(),
    status: z.enum(['active', 'paused']).optional(),
    notBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    dailyCap: z.number().int().min(1).max(5000).nullable().optional(),
  }),
  /** Arma los cinco bloques por frente comercial y reparte lo que no tiene bloque. */
  z.object({ action: z.literal('suggest') }),
  z.object({ action: z.literal('reorder'), ids: z.array(z.number().int().positive()).max(200) }),
  z.object({ action: z.literal('assign'), blockId: z.number().int().positive().nullable(), chatId: z.number().int().positive().optional(), messageIds: z.array(z.string().max(120)).max(500).optional() }),
]);

/** POST { action: 'create' | 'suggest' | 'reorder' | 'assign', … } */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  const d = parsed.data;
  try {
    if (d.action === 'create') return NextResponse.json({ bloque: await createAudioBlock(ctx.team.id, ctx.user.id, d) }, { status: 201 });
    if (d.action === 'suggest') return NextResponse.json(await sugerirBloques(ctx.team.id, ctx.user.id));
    if (d.action === 'reorder') return NextResponse.json({ bloques: await reorderAudioBlocks(ctx.team.id, ctx.user.id, d.ids) });
    return NextResponse.json(await assignAudioBlock(ctx.team.id, ctx.user.id, { blockId: d.blockId, chatId: d.chatId, messageIds: d.messageIds }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
