import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { z } from 'zod';
import { listAudios, listNuncaTranscribir, setNuncaTranscribir, type AudioEstado } from '@/lib/plugins/sales-ops/server/audios';

export const dynamic = 'force-dynamic';

/** GET ?estado=pendientes|transcriptos|fallidos|todos &enCola=1 &entrantes=0 &chatId= &q= &limit= */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const estado = sp.get('estado');
  const chatId = Number(sp.get('chatId'));
  try {
    const rows = await listAudios(ctx.team.id, {
      estado: (['pendientes', 'en_cola', 'transcriptos', 'fallidos', 'todos'] as AudioEstado[]).includes(estado as AudioEstado) ? (estado as AudioEstado) : 'pendientes',
      soloEnCola: sp.get('enCola') === '1',
      soloEntrantes: sp.get('entrantes') !== '0',
      chatId: Number.isInteger(chatId) && chatId > 0 ? chatId : undefined,
      q: sp.get('q') ?? undefined,
      limit: Number(sp.get('limit')) || undefined,
    });
    const nunca = await listNuncaTranscribir(ctx.team.id);
    return NextResponse.json({ rows, nunca });
  } catch (error) {
    console.error('[sales-ops/audios]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const nuncaSchema = z.object({ action: z.literal('nunca'), chatId: z.number().int().positive(), nunca: z.boolean() });

/** POST { action: 'nunca', chatId, nunca } → marca o desmarca un chat como "nunca transcribir". */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = nuncaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { action: "nunca", chatId, nunca }' }, { status: 400 });
  try {
    return NextResponse.json(await setNuncaTranscribir(ctx.team.id, ctx.user.id, parsed.data.chatId, parsed.data.nunca));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
