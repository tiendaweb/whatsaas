import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { automations, evolutionInstances, teamScheduledMessages } from '@/lib/db/schema';
import { MessagingError, resolveSendingInstance } from '@/lib/messaging/send';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { InstanceOwnershipError, assertTeamInstance } from '@/lib/instances/ownership';
import { computeNextRunAt } from '@/lib/plugins/scheduled-messages/schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── Validation schema ────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(['active', 'paused']).default('active'),
  instanceId: z.number().int().nullable().optional(),
  targetNumbers: z.array(z.string()).default([]),
  scheduleType: z.enum(['once', 'daily', 'weekly']).default('once'),
  // Sin `.datetime()`, un "mañana 10:00" llegaba como Invalid Date y drizzle
  // tiraba RangeError al serializarlo: 500 sin mensaje útil.
  scheduledAt: z.string().datetime().nullable().optional(),
  hour: z.number().int().min(0).max(23).nullable().optional(),
  minute: z.number().int().min(0).max(59).nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  actionType: z.enum(['message', 'automation']).default('message'),
  message: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  automationId: z.number().int().nullable().optional(),
  maxRuns: z.number().int().min(1).nullable().optional(),
  /** Prompt guardado con el que se reescribe este mensaje desde el Command Center. */
  aiPrompt: z.string().max(4000).nullable().optional(),
});

// ─── GET: list all scheduled messages for team ────────────────────────────────

export async function GET() {
  const ctx = await getPluginRequestContext('scheduledMessagesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const rows = await db
    .select({
      id: teamScheduledMessages.id,
      teamId: teamScheduledMessages.teamId,
      name: teamScheduledMessages.name,
      status: teamScheduledMessages.status,
      instanceId: teamScheduledMessages.instanceId,
      instanceName: evolutionInstances.instanceName,
      targetNumbers: teamScheduledMessages.targetNumbers,
      scheduleType: teamScheduledMessages.scheduleType,
      scheduledAt: teamScheduledMessages.scheduledAt,
      hour: teamScheduledMessages.hour,
      minute: teamScheduledMessages.minute,
      weekdays: teamScheduledMessages.weekdays,
      actionType: teamScheduledMessages.actionType,
      message: teamScheduledMessages.message,
      mediaUrl: teamScheduledMessages.mediaUrl,
      automationId: teamScheduledMessages.automationId,
      automationName: automations.name,
      lastRunAt: teamScheduledMessages.lastRunAt,
      nextRunAt: teamScheduledMessages.nextRunAt,
      runCount: teamScheduledMessages.runCount,
      maxRuns: teamScheduledMessages.maxRuns,
      lastError: teamScheduledMessages.lastError,
      aiPrompt: teamScheduledMessages.aiPrompt,
      createdBy: teamScheduledMessages.createdBy,
      createdAt: teamScheduledMessages.createdAt,
      updatedAt: teamScheduledMessages.updatedAt,
    })
    .from(teamScheduledMessages)
    .leftJoin(evolutionInstances, eq(teamScheduledMessages.instanceId, evolutionInstances.id))
    .leftJoin(automations, eq(teamScheduledMessages.automationId, automations.id))
    .where(eq(teamScheduledMessages.teamId, ctx.team.id))
    .orderBy(asc(teamScheduledMessages.createdAt));

  return NextResponse.json(rows);
}

// ─── POST: create new scheduled message ──────────────────────────────────────

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('scheduledMessagesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;

  const nextRunAt = computeNextRunAt({
    scheduleType: d.scheduleType,
    scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
    hour: d.hour ?? null,
    minute: d.minute ?? null,
    weekdays: d.weekdays,
  });

  // Sin instancia el programado no falla acá: falla recién cuando el cron lo
  // ejecuta, y hasta entonces se ve como si hubiera quedado bien guardado.
  //
  // El `instanceId` del body se valida contra el equipo: sin eso se podía
  // programar un envío desde el número de WhatsApp de otro tenant, y el cron lo
  // ejecutaba con el token ajeno.
  let instanceId: number | null = null;
  try {
    instanceId = d.instanceId != null
      ? (await assertTeamInstance(ctx.team.id, d.instanceId)).id
      : (await resolveSendingInstance(ctx.team.id)).instance.id;
  } catch (error) {
    if (error instanceof MessagingError || error instanceof InstanceOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const [created] = await db
    .insert(teamScheduledMessages)
    .values({
      teamId: ctx.team.id,
      name: d.name,
      status: d.status,
      instanceId,
      targetNumbers: d.targetNumbers,
      scheduleType: d.scheduleType,
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      hour: d.hour ?? null,
      minute: d.minute ?? null,
      weekdays: d.weekdays,
      actionType: d.actionType,
      message: d.message ?? null,
      mediaUrl: d.mediaUrl ?? null,
      automationId: d.automationId ?? null,
      maxRuns: d.maxRuns ?? null,
      aiPrompt: d.aiPrompt?.trim() ? d.aiPrompt.trim() : null,
      nextRunAt,
      createdBy: ctx.user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
