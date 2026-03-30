import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamEvents, teamNotifications } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

const updateSchema = z.object({
  title: z.string().min(1).max(180).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  attendees: z.array(z.string()).optional(),
  notes: z.string().optional(),
  reminderAt: z.string().datetime().nullable().optional(),
  status: z.enum(['scheduled', 'completed', 'canceled']).optional(),
  departmentId: z.number().int().nullable().optional(),
  relatedUserId: z.number().int().nullable().optional(),
  contactId: z.number().int().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('calendarWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const [updated] = await db
    .update(teamEvents)
    .set({
      ...payload,
      startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
      endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
      reminderAt: payload.reminderAt === undefined ? undefined : payload.reminderAt ? new Date(payload.reminderAt) : null,
      updatedBy: context.user.id,
      updatedAt: new Date(),
    })
    .where(and(eq(teamEvents.id, Number(id)), eq(teamEvents.teamId, context.team.id)))
    .returning();

  if (updated) {
    await db.insert(teamNotifications).values({
      teamId: context.team.id,
      userId: context.user.id,
      type: 'calendar.event.updated',
      title: 'Evento actualizado',
      body: `El evento "${updated.title}" cambió a estado ${updated.status}.`,
      entityType: 'calendar_event',
      entityId: updated.id,
      createdAt: new Date(),
    });
  }

  return NextResponse.json(updated ?? null);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('calendarWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  await db.delete(teamEvents).where(and(eq(teamEvents.id, Number(id)), eq(teamEvents.teamId, context.team.id)));
  return NextResponse.json({ ok: true });
}
