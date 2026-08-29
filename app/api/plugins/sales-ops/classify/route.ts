import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { ClassificationInputError, classifyChat } from '@/lib/plugins/sales-ops/server/classifier';
import { DossierError } from '@/lib/plugins/sales-ops/server/dossier';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.object({
  chatId: z.number().int().positive(),
  engine: z.literal('server').optional(),
  dryRun: z.boolean().optional(),
});

/** POST { chatId, engine?: 'server', dryRun? } → clasifica con el motor del servidor y versiona. */
export async function POST(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const teamId = ctx.team.id;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: se espera { chatId, engine?: "server" }' }, { status: 400 });

  try {
    const result = await classifyChat(teamId, parsed.data.chatId, { engine: 'server', userId: ctx.user.id, dryRun: parsed.data.dryRun });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DossierError) return NextResponse.json({ error: error.message }, { status: error.code === 'not_found' ? 404 : 422 });
    if (error instanceof ClassificationInputError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error('[sales-ops/classify]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
