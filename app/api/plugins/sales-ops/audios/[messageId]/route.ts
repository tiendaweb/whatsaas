import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { actOnAudio } from '@/lib/plugins/sales-ops/server/audios';

export const dynamic = 'force-dynamic';
/** Transcribir con el banco puede tardar más que una escritura. */
export const maxDuration = 120;

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('transcribe') }),
  z.object({ action: z.literal('analyze') }),
  z.object({ action: z.literal('queue') }),
  z.object({ action: z.literal('dequeue') }),
  /** -1 al final · 0 normal · 5 adelante · 10 primero. */
  z.object({ action: z.literal('priority'), priority: z.number().int().min(-1).max(10) }),
  z.object({ action: z.literal('block'), blockId: z.number().int().positive().nullable() }),
  z.object({
    action: z.literal('write'),
    ficha: z.object({
      transcript: z.string().max(20000).optional(),
      summary: z.string().max(4000).optional(),
      intent: z.string().max(40).optional(),
      urgency: z.string().max(20).optional(),
      sentiment: z.string().max(20).optional(),
      language: z.string().max(10).optional(),
      actionItems: z.array(z.string().max(300)).max(20).optional(),
    }),
  }),
  z.object({ action: z.literal('ask_connector'), nota: z.string().max(2000).optional() }),
  /** Se lo pide a una persona: sale de la cola, tarea asignada y aviso. */
  z.object({ action: z.literal('ask_human'), nota: z.string().max(2000).optional() }),
]);

/** POST → acción a mano sobre un audio: transcribir, analizar, encolar, quitar, prioridad, bloque, guardar ficha, pedir contexto a un conector o a una persona. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { messageId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { action, ficha?, nota?, priority?, blockId? }' }, { status: 400 });
  try {
    return NextResponse.json(await actOnAudio(ctx.team.id, ctx.user.id, messageId, parsed.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
