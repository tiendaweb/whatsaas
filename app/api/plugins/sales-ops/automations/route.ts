import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { activityLogs, automationSessions, automations, chats } from '@/lib/db/schema';
import { triggerAutomationManually } from '@/lib/automation/engine';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';

export const dynamic = 'force-dynamic';

/** GET → flujos del equipo (activos primero), para elegir uno desde una tarjeta de Respuestas. */
export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const rows = await db.query.automations.findMany({
    where: eq(automations.teamId, ctx.team.id),
    columns: { id: true, name: true, isActive: true, instanceId: true },
    orderBy: [asc(automations.name)],
  });
  return NextResponse.json({ automations: rows.filter((a) => a.isActive).concat(rows.filter((a) => !a.isActive)) });
}

const schema = z.object({ chatId: z.number().int().positive(), automationId: z.number().int().positive() });

/**
 * POST { chatId, automationId } → dispara un flujo sobre un chat, igual que la
 * tool whatspro_chat_trigger_automation. Es lo único de Respuestas que le
 * llega al cliente sin pasar por la cola, por eso queda auditado.
 */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { chatId, automationId }' }, { status: 400 });
  const { chatId, automationId } = parsed.data;
  const [chat, automation] = await Promise.all([
    db.query.chats.findFirst({ where: and(eq(chats.id, chatId), eq(chats.teamId, ctx.team.id)), columns: { id: true, remoteJid: true, instanceId: true } }),
    db.query.automations.findFirst({ where: and(eq(automations.id, automationId), eq(automations.teamId, ctx.team.id)), columns: { id: true, name: true, isActive: true } }),
  ]);
  if (!chat) return NextResponse.json({ error: 'Chat no encontrado' }, { status: 404 });
  if (!automation) return NextResponse.json({ error: 'Flujo no encontrado' }, { status: 404 });
  if (!chat.instanceId) return NextResponse.json({ error: 'El chat no tiene una instancia de WhatsApp asociada.' }, { status: 422 });
  try {
    const triggered = await triggerAutomationManually(ctx.team.id, chat.id, chat.remoteJid, chat.instanceId, { automationId });
    if (triggered) {
      await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'SALES_OPS_AUTOMATION_TRIGGERED', metadata: { chatId, automationId, name: automation.name }, ipAddress: null }).catch(() => null);
    }
    return NextResponse.json({ triggered, automation: { id: automation.id, name: automation.name }, error: triggered ? null : 'El motor no pudo disparar el flujo: revisá que la instancia esté conectada y que el flujo tenga un nodo de inicio.' }, { status: triggered ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const cortarSchema = z.object({ chatId: z.number().int().positive(), cortar: z.boolean().default(true) });

/**
 * PATCH { chatId, cortar } → corta (o vuelve a habilitar) el flujo de ESTE chat.
 *
 * Supervisando aparece seguido: se está por escribirle algo a mano y hay un bot
 * a mitad de una secuencia. Antes había que salir del Focus, buscar el chat en
 * WhatsPro y apagarlo ahí; para cuando volvías, el bot ya había mandado otro.
 *
 * Corta las dos cosas, porque son dos: la bandera del chat evita que un flujo
 * NUEVO lo tome, y cerrar la sesión activa frena el que ya venía corriendo.
 * Apagar sólo la bandera dejaba la secuencia en curso terminando tranquila.
 */
export async function PATCH(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = cortarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { chatId, cortar? }' }, { status: 400 });
  const { chatId, cortar } = parsed.data;

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, chatId), eq(chats.teamId, ctx.team.id)), columns: { id: true } });
  if (!chat) return NextResponse.json({ error: 'Chat no encontrado' }, { status: 404 });

  await db.update(chats).set({ automationDisabled: cortar }).where(and(eq(chats.id, chatId), eq(chats.teamId, ctx.team.id)));

  let cerradas = 0;
  if (cortar) {
    const filas = await db
      .update(automationSessions)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(automationSessions.teamId, ctx.team.id), eq(automationSessions.chatId, chatId), eq(automationSessions.status, 'active')))
      .returning({ id: automationSessions.id });
    cerradas = filas.length;
  }

  try {
    await db.insert(activityLogs).values({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      action: cortar ? 'SALES_OPS_AUTOMATION_CUT' : 'SALES_OPS_AUTOMATION_RESUMED',
      metadata: { chatId, sesionesCerradas: cerradas },
      ipAddress: null,
    });
  } catch (error) {
    console.error('[sales-ops/automations] audit', error);
  }

  return NextResponse.json({ ok: true, automationDisabled: cortar, sesionesCerradas: cerradas });
}
