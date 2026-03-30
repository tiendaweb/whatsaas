import { NextResponse } from 'next/server';
import { and, asc, eq, gte, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamEvents, teamNotifications, teamPlugins } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

const createEventSchema = z.object({
  title: z.string().min(1).max(180),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  attendees: z.array(z.string()).default([]),
  notes: z.string().default(''),
  reminderAt: z.string().datetime().nullable().optional(),
  status: z.enum(['scheduled', 'completed', 'canceled']).default('scheduled'),
  departmentId: z.number().int().nullable().optional(),
  relatedUserId: z.number().int().nullable().optional(),
  contactId: z.number().int().nullable().optional(),
  validateOverlap: z.boolean().optional(),
});

export async function GET() {
  const context = await getPluginRequestContext('calendarRead');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const events = await db
    .select()
    .from(teamEvents)
    .where(eq(teamEvents.teamId, context.team.id))
    .orderBy(asc(teamEvents.startsAt));

  return NextResponse.json(events);
}

export async function POST(request: Request) {
  const context = await getPluginRequestContext('calendarWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const body = await request.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);

  if (endsAt <= startsAt) {
    return NextResponse.json({ error: 'endsAt debe ser mayor a startsAt.' }, { status: 400 });
  }

  const [pluginState] = await db
    .select({ settings: teamPlugins.settings })
    .from(teamPlugins)
    .where(and(eq(teamPlugins.teamId, context.team.id), eq(teamPlugins.pluginId, 'calendar')))
    .limit(1);

  const enforceOverlap = Boolean((pluginState?.settings as { enforceOverlapValidation?: boolean } | undefined)?.enforceOverlapValidation);
  const needsValidation = enforceOverlap || parsed.data.validateOverlap === true;

  if (needsValidation) {
    const overlapping = await db
      .select({ id: teamEvents.id })
      .from(teamEvents)
      .where(
        and(
          eq(teamEvents.teamId, context.team.id),
          or(
            and(lte(teamEvents.startsAt, startsAt), gte(teamEvents.endsAt, startsAt)),
            and(lte(teamEvents.startsAt, endsAt), gte(teamEvents.endsAt, endsAt)),
          ),
        ),
      )
      .limit(1);

    if (overlapping.length > 0) {
      return NextResponse.json({ error: 'Existe un evento solapado.' }, { status: 409 });
    }
  }

  const [created] = await db
    .insert(teamEvents)
    .values({
      teamId: context.team.id,
      title: parsed.data.title,
      startsAt,
      endsAt,
      attendees: parsed.data.attendees,
      notes: parsed.data.notes,
      reminderAt: parsed.data.reminderAt ? new Date(parsed.data.reminderAt) : null,
      status: parsed.data.status,
      departmentId: parsed.data.departmentId ?? null,
      relatedUserId: parsed.data.relatedUserId ?? null,
      contactId: parsed.data.contactId ?? null,
      createdBy: context.user.id,
      updatedBy: context.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await db.insert(teamNotifications).values({
    teamId: context.team.id,
    userId: context.user.id,
    type: 'calendar.event.created',
    title: 'Evento creado',
    body: `Se creó "${created.title}" para ${startsAt.toLocaleString()}.`,
    entityType: 'calendar_event',
    entityId: created.id,
    createdAt: new Date(),
  });

  return NextResponse.json(created, { status: 201 });
}
