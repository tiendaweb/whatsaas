import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { getEvent } from '@/lib/plugins/calendar/server/events';
import { cerrarReunion, crearTareaDesdeEvento } from '@/lib/plugins/calendar/server/reuniones';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('calendarRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  const evento = await getEvent(ctx.team.id, id);
  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
  return NextResponse.json({ event: evento });
}

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cerrar'),
    outcome: z.string().max(4000).optional(),
    nextAction: z.string().max(4000).optional(),
    notes: z.string().max(4000).optional(),
    status: z.enum(['completed', 'canceled']).optional(),
  }),
  z.object({ action: z.literal('tarea'), title: z.string().max(200).optional(), notes: z.string().max(4000).optional(), dueDate: z.string().max(10).nullable().optional() }),
]);

/** POST { action: 'cerrar' | 'tarea' } → cierra la reunión o manda su próxima acción a Tareas OS. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('calendarWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  try {
    if (parsed.data.action === 'cerrar') return NextResponse.json({ event: await cerrarReunion(ctx.team.id, ctx.user.id, id, parsed.data) });
    return NextResponse.json(await crearTareaDesdeEvento(ctx.team.id, ctx.user.id, id, parsed.data), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
