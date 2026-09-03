import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { createEvent, deleteEvent, getEvent, listEventsInRange, overlappingEvents, updateEvent } from '@/lib/plugins/calendar/server/events';
import { EVENT_KINDS, EVENT_STATUSES, RECURRENCES } from '@/lib/plugins/calendar/shared/tipos';

export const dynamic = 'force-dynamic';

/**
 * La agenda del Calendario: una sola ruta para leer un rango y para escribir.
 *
 * La ruta vieja (`/events`) devuelve TODOS los eventos sin rango y la usa el
 * panel de admin; no se toca. Ésta es la que usa la app nueva: pide siempre un
 * rango, expande las repeticiones y trae el contacto y el cliente resueltos.
 */
export async function GET(request: NextRequest) {
  const ctx = await getPluginRequestContext('calendarRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const from = new Date(sp.get('from') ?? '');
  const to = new Date(sp.get('to') ?? '');
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return NextResponse.json({ error: 'from y to son obligatorios (ISO 8601)' }, { status: 400 });
  }
  const kinds = (sp.get('kinds') ?? '').split(',').filter((k) => (EVENT_KINDS as readonly string[]).includes(k));
  const status = (sp.get('status') ?? '').split(',').filter((s) => (EVENT_STATUSES as readonly string[]).includes(s));
  const userId = Number(sp.get('userId'));
  const contactId = Number(sp.get('contactId'));
  try {
    const events = await listEventsInRange(ctx.team.id, {
      from,
      to,
      kinds: kinds.length ? (kinds as never) : undefined,
      status: status.length ? (status as never) : undefined,
      userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
      contactId: Number.isInteger(contactId) && contactId > 0 ? contactId : undefined,
      q: sp.get('q') ?? undefined,
    });
    return NextResponse.json({ events });
  } catch (error) {
    console.error('[calendar/agenda] GET', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const eventoSchema = z.object({
  title: z.string().trim().min(1).max(180),
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean().optional(),
  kind: z.enum(EVENT_KINDS).optional(),
  subtype: z.string().max(40).nullable().optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  notes: z.string().max(4000).optional(),
  location: z.string().max(300).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  recurrence: z.enum(RECURRENCES).optional(),
  recurrenceUntil: z.string().max(10).nullable().optional(),
  reminderMinutes: z.array(z.number().int().min(0).max(20160)).max(5).optional(),
  attendees: z.array(z.string().max(120)).max(30).optional(),
  contactId: z.number().int().positive().nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  relatedUserId: z.number().int().positive().nullable().optional(),
  outcome: z.string().max(4000).optional(),
  nextAction: z.string().max(4000).optional(),
  /** Avisa si choca con otro evento en vez de crearlo. */
  validateOverlap: z.boolean().optional(),
});

function fechas(input: { startsAt: string; endsAt: string }) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) throw new Error('Fechas inválidas');
  if (endsAt <= startsAt) throw new Error('El evento tiene que terminar después de empezar');
  return { startsAt, endsAt };
}

export async function POST(request: NextRequest) {
  const ctx = await getPluginRequestContext('calendarWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = eventoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos del evento inválidos', detalle: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    const { startsAt, endsAt } = fechas(parsed.data);
    if (parsed.data.validateOverlap) {
      const choques = await overlappingEvents(ctx.team.id, startsAt, endsAt);
      if (choques.length) return NextResponse.json({ error: 'Ese horario ya está ocupado', conflicts: choques }, { status: 409 });
    }
    const evento = await createEvent(ctx.team.id, ctx.user.id, { ...parsed.data, startsAt, endsAt });
    return NextResponse.json({ event: evento }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

const patchSchema = eventoSchema.partial().extend({ id: z.number().int().positive() });

export async function PATCH(request: NextRequest) {
  const ctx = await getPluginRequestContext('calendarWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  const { id, validateOverlap, startsAt, endsAt, ...resto } = parsed.data;
  try {
    const actual = await getEvent(ctx.team.id, id);
    if (!actual) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    const inicio = startsAt ? new Date(startsAt) : new Date(actual.startsAt);
    const fin = endsAt ? new Date(endsAt) : new Date(actual.endsAt);
    if (fin <= inicio) return NextResponse.json({ error: 'El evento tiene que terminar después de empezar' }, { status: 422 });
    if (validateOverlap) {
      const choques = await overlappingEvents(ctx.team.id, inicio, fin, id);
      if (choques.length) return NextResponse.json({ error: 'Ese horario ya está ocupado', conflicts: choques }, { status: 409 });
    }
    const evento = await updateEvent(ctx.team.id, ctx.user.id, id, { ...resto, startsAt: inicio, endsAt: fin });
    return NextResponse.json({ event: evento });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await getPluginRequestContext('calendarWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const ok = await deleteEvent(ctx.team.id, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
