import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { z } from 'zod';
import { AUDIO_ESTADOS, actOnChatAudios, cambiarReserva, cambiarTranscripcionAutomatica, elegirHumano, humanoDeAudios, listAudios, listNuncaTranscribir, listarMiembros, resumenAudios, setNuncaTranscribir, type AudioEstado } from '@/lib/plugins/sales-ops/server/audios';
import { listAudioBlocks } from '@/lib/plugins/sales-ops/server/audio-blocks';

export const dynamic = 'force-dynamic';
/** Pedirle a una persona crea una tarea y despacha avisos: puede tardar más que una lectura. */
export const maxDuration = 60;

/**
 * GET ?estado=en_cola|sin_encolar|transcriptos|fallidos|quitados|todos &enCola=1 &entrantes=0 &chatId= &q= &limit=
 *
 * `estado=en_cola` (default) es la cola de Gemini tal cual la va a drenar el
 * worker, en su orden. Devuelve además `resumen` (conteos, cuota y reserva del
 * banco), `bloques` (los bloques de trabajo con sus conteos), `humano` (a
 * quién se le piden transcripciones a mano) y la lista "nunca transcribir".
 */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const estado = sp.get('estado');
  const chatId = Number(sp.get('chatId'));
  try {
    const [rows, nunca, resumen, bloques, humano, miembros] = await Promise.all([
      listAudios(ctx.team.id, {
        estado: AUDIO_ESTADOS.includes(estado as AudioEstado) ? (estado as AudioEstado) : 'en_cola',
        soloEnCola: sp.get('enCola') === '1',
        soloEntrantes: sp.get('entrantes') !== '0',
        chatId: Number.isInteger(chatId) && chatId > 0 ? chatId : undefined,
        q: sp.get('q') ?? undefined,
        limit: Number(sp.get('limit')) || undefined,
      }),
      listNuncaTranscribir(ctx.team.id),
      resumenAudios(ctx.team.id),
      listAudioBlocks(ctx.team.id),
      humanoDeAudios(ctx.team.id),
      listarMiembros(ctx.team.id),
    ]);
    return NextResponse.json({ rows, nunca, resumen, bloques, humano, miembros });
  } catch (error) {
    console.error('[sales-ops/audios]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const chatId = z.number().int().positive();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('nunca'), chatId, nunca: z.boolean() }),
  /** Saca de la cola de Gemini todos los audios pendientes del contacto (quedan "quitados"; el cron no los vuelve a encolar). */
  z.object({ action: z.literal('dequeue_chat'), chatId }),
  /** Encola (o vuelve a encolar) los audios del contacto, adelante. */
  z.object({ action: z.literal('queue_chat'), chatId }),
  /** Prioridad de todos los pendientes del contacto: -1 al final · 0 normal · 5 adelante · 10 primero. */
  z.object({ action: z.literal('priority_chat'), chatId, priority: z.number().int().min(-1).max(10) }),
  /** Mete (o saca, con null) los pendientes del contacto en un bloque. */
  z.object({ action: z.literal('block_chat'), chatId, blockId: z.number().int().positive().nullable() }),
  /** Le pide a una persona que escuche los audios pendientes del contacto y deje el contexto. */
  z.object({ action: z.literal('ask_human_chat'), chatId, nota: z.string().max(2000).optional() }),
  /** Porcentaje de la cuota diaria del banco que no consumen los procesos automáticos. */
  z.object({ action: z.literal('reserva'), pct: z.number().min(0).max(90) }),
  /** Check "usar Gemini para transcribir audios": frena sólo al worker por cron. */
  z.object({ action: z.literal('transcripcion'), activa: z.boolean() }),
  /** A quién se le piden las transcripciones a mano. */
  z.object({ action: z.literal('humano'), userId: z.number().int().positive().nullable() }),
]);

/** POST { action, … } → acciones por contacto, reserva del banco y persona de referencia. */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { action, chatId?, … }' }, { status: 400 });
  const d = parsed.data;
  try {
    if (d.action === 'nunca') return NextResponse.json(await setNuncaTranscribir(ctx.team.id, ctx.user.id, d.chatId, d.nunca));
    if (d.action === 'reserva') return NextResponse.json(await cambiarReserva(ctx.team.id, ctx.user.id, d.pct));
    if (d.action === 'transcripcion') return NextResponse.json(await cambiarTranscripcionAutomatica(ctx.team.id, ctx.user.id, d.activa));
    if (d.action === 'humano') return NextResponse.json({ humano: await elegirHumano(ctx.team.id, ctx.user.id, d.userId) });
    const { chatId: id, ...resto } = d;
    return NextResponse.json(await actOnChatAudios(ctx.team.id, ctx.user.id, id, resto));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
