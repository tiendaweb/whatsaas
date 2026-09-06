import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamScheduledMessages } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { computeNextRunAt } from '@/lib/plugins/scheduled-messages/schedule';
import { aLocal, formatoLocal, proximoHorarioFuturo } from '@/lib/time/zona';
import { InstanceOwnershipError, assertTeamInstance } from '@/lib/instances/ownership';
import { pausarAutomatizacionesDelProgramado } from '@/lib/chats/pausar-automatizacion';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'paused', 'completed', 'failed']).optional(),
  instanceId: z.number().int().nullable().optional(),
  targetNumbers: z.array(z.string()).optional(),
  scheduleType: z.enum(['once', 'daily', 'weekly']).optional(),
  // Sin `.datetime()`, un "mañana 10:00" llegaba como Invalid Date y drizzle
  // tiraba RangeError al serializarlo: 500 sin mensaje útil.
  scheduledAt: z.string().datetime().nullable().optional(),
  hour: z.number().int().min(0).max(23).nullable().optional(),
  minute: z.number().int().min(0).max(59).nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  actionType: z.enum(['message', 'automation']).optional(),
  message: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  automationId: z.number().int().nullable().optional(),
  maxRuns: z.number().int().min(1).nullable().optional(),
  /** Prompt guardado con el que se reescribe este mensaje desde el Command Center. */
  aiPrompt: z.string().max(4000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('scheduledMessagesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const msgId = parseInt(id, 10);
  if (isNaN(msgId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;

  // Fetch current to merge scheduleType/hour/minute/weekdays for nextRunAt recompute
  const existing = await db.query.teamScheduledMessages.findFirst({
    where: and(eq(teamScheduledMessages.id, msgId), eq(teamScheduledMessages.teamId, ctx.team.id)),
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const mergedScheduleType = d.scheduleType ?? existing.scheduleType;
  const mergedScheduledAt = 'scheduledAt' in d
    ? (d.scheduledAt ? new Date(d.scheduledAt) : null)
    : existing.scheduledAt;
  const mergedHour = 'hour' in d ? (d.hour ?? null) : existing.hour;
  const mergedMinute = 'minute' in d ? (d.minute ?? null) : existing.minute;
  const mergedWeekdays = d.weekdays ?? (existing.weekdays as number[]);

  // Una hora ya pasada en un "una vez" saldría en la próxima corrida del cron:
  // se rechaza con el próximo horario que tiene sentido. Sólo cuando se cambia
  // la fecha o se reactiva; pausar o editar el texto de uno vencido está bien.
  if (mergedScheduleType === 'once' && mergedScheduledAt && ('scheduledAt' in d || d.status === 'active')) {
    const proximo = proximoHorarioFuturo(mergedScheduledAt);
    if (proximo.ajustado && (existing.status !== 'active' || 'scheduledAt' in d)) {
      return NextResponse.json(
        { error: `La hora elegida (${formatoLocal(mergedScheduledAt)}) ya pasó. Sugerencia: ${formatoLocal(proximo.date)}.`, code: 'past_schedule', sugerencia: aLocal(proximo.date), sugerenciaIso: proximo.date.toISOString() },
        { status: 422 },
      );
    }
  }

  // Recompute nextRunAt only if scheduling fields changed or status is being set to active
  const needsRecompute = d.scheduleType || 'scheduledAt' in d || 'hour' in d || 'minute' in d || d.weekdays || d.status === 'active';
  const nextRunAt = needsRecompute
    ? computeNextRunAt({
        scheduleType: mergedScheduleType,
        scheduledAt: mergedScheduledAt,
        hour: mergedHour,
        minute: mergedMinute,
        weekdays: mergedWeekdays,
      })
    : undefined;

  const vals: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) vals.name = d.name;
  if (d.status !== undefined) vals.status = d.status;
  // Ídem el POST: reasignar el programado a la instancia de otro equipo era
  // otra puerta al mismo envío con credenciales ajenas.
  if ('instanceId' in d) {
    if (d.instanceId == null) {
      vals.instanceId = null;
    } else {
      try {
        vals.instanceId = (await assertTeamInstance(ctx.team.id, d.instanceId)).id;
      } catch (error) {
        if (error instanceof InstanceOwnershipError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }
  }
  if (d.targetNumbers !== undefined) vals.targetNumbers = d.targetNumbers;
  if (d.scheduleType !== undefined) vals.scheduleType = d.scheduleType;
  if ('scheduledAt' in d) vals.scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
  if ('hour' in d) vals.hour = d.hour ?? null;
  if ('minute' in d) vals.minute = d.minute ?? null;
  if (d.weekdays !== undefined) vals.weekdays = d.weekdays;
  if (d.actionType !== undefined) vals.actionType = d.actionType;
  if ('message' in d) vals.message = d.message ?? null;
  if ('mediaUrl' in d) vals.mediaUrl = d.mediaUrl ?? null;
  if ('automationId' in d) vals.automationId = d.automationId ?? null;
  if ('maxRuns' in d) vals.maxRuns = d.maxRuns ?? null;
  if ('aiPrompt' in d) vals.aiPrompt = d.aiPrompt?.trim() ? d.aiPrompt.trim() : null;
  if (nextRunAt !== undefined) vals.nextRunAt = nextRunAt;

  const [updated] = await db
    .update(teamScheduledMessages)
    .set(vals)
    .where(and(eq(teamScheduledMessages.id, msgId), eq(teamScheduledMessages.teamId, ctx.team.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Editarlo puede cambiar el destinatario o reactivarlo: se vuelve a mirar,
  // porque el chat nuevo puede tener flujos encendidos.
  // Ver lib/chats/pausar-automatizacion.
  await pausarAutomatizacionesDelProgramado(ctx.team.id, updated);

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('scheduledMessagesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const msgId = parseInt(id, 10);
  if (isNaN(msgId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamScheduledMessages)
    .where(and(eq(teamScheduledMessages.id, msgId), eq(teamScheduledMessages.teamId, ctx.team.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
