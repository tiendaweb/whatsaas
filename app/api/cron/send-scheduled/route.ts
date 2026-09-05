import { NextResponse } from 'next/server';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  evolutionInstances,
  messages,
  teamScheduledMessages,
  type TeamScheduledMessage,
} from '@/lib/db/schema';
import { triggerAutomationManually } from '@/lib/automation/engine';
import { pusherServer } from '@/lib/pusher-server';
import { processDueAappRenewals } from '@/lib/plugins/scheduled-messages/aapp-renewals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

// ─── Helper: compute next run date ───────────────────────────────────────────

function computeNextRunAt(msg: TeamScheduledMessage): Date | null {
  const now = new Date();

  if (msg.scheduleType === 'once') {
    return null; // after sending, mark completed
  }

  if (msg.scheduleType === 'daily') {
    const next = new Date();
    next.setHours(msg.hour ?? 9, msg.minute ?? 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  if (msg.scheduleType === 'weekly') {
    const weekdays = (msg.weekdays as number[]) ?? [];
    if (!weekdays.length) return null;
    for (let i = 1; i <= 7; i++) {
      const next = new Date();
      next.setDate(next.getDate() + i);
      next.setHours(msg.hour ?? 9, msg.minute ?? 0, 0, 0);
      if (weekdays.includes(next.getDay())) return next;
    }
    return null;
  }

  return null;
}

// ─── Helper: format phone number for WhatsApp JID ────────────────────────────

function toJid(num: string): string {
  const clean = num.replace(/\D/g, '');
  return clean.endsWith('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;
}

function toPhoneNumber(num: string): string {
  return num.replace('@s.whatsapp.net', '').replace(/\D/g, '');
}

async function safePusherTrigger(channel: string, event: string, data: unknown) {
  try {
    await pusherServer.trigger(channel, event, data);
  } catch (error) {
    console.error(`[cron/send-scheduled] Pusher error for ${channel}/${event}:`, error);
  }
}

async function findOrCreateChat(msg: TeamScheduledMessage, remoteJid: string) {
  let chat = await db.query.chats.findFirst({
    where: and(
      eq(chats.teamId, msg.teamId),
      eq(chats.remoteJid, remoteJid),
      eq(chats.instanceId, msg.instanceId!),
    ),
    columns: { id: true },
  });

  if (!chat) {
    const [createdChat] = await db
      .insert(chats)
      .values({
        teamId: msg.teamId,
        instanceId: msg.instanceId!,
        remoteJid,
        name: remoteJid.split('@')[0],
      })
      .onConflictDoNothing()
      .returning({ id: chats.id });

    chat = createdChat ?? await db.query.chats.findFirst({
      where: and(
        eq(chats.teamId, msg.teamId),
        eq(chats.remoteJid, remoteJid),
        eq(chats.instanceId, msg.instanceId!),
      ),
      columns: { id: true },
    });
  }

  return chat;
}

/**
 * Marcar un programado como fallido guardando el motivo. Sin el motivo, el
 * usuario ve "fallido" en el tablero y no tiene forma de saber si le faltó la
 * instancia, si el token venció o si Evolution rechazó el número.
 */
async function failScheduledMessage(
  id: number,
  reason: string,
  extra: { runCount?: number; lastRunAt?: Date } = {},
) {
  await db
    .update(teamScheduledMessages)
    .set({
      status: 'failed',
      lastError: reason.slice(0, 1000),
      nextRunAt: null,
      ...extra,
      updatedAt: new Date(),
    })
    .where(eq(teamScheduledMessages.id, id));
}

function summarizeErrors(errors: string[]) {
  const shown = errors.slice(0, 3).join(' | ');
  return errors.length > 3 ? `${shown} (y ${errors.length - 3} más)` : shown;
}

// ─── Main cron handler ────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/send-scheduled] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // AAPP Space renewals use an independent, manually-approved queue. A failure
  // here must not prevent regular scheduled messages from being processed.
  let aappSpace = { processed: 0, errors: [] as Array<{ id: number; error: string }> };
  try {
    aappSpace = await processDueAappRenewals(now);
  } catch (error) {
    console.error('[cron/send-scheduled] AAPP Space queue failed:', error);
    aappSpace.errors.push({ id: 0, error: error instanceof Error ? error.message : String(error) });
  }

  // Find all active messages due to run
  const dueMsgs = await db
    .select()
    .from(teamScheduledMessages)
    .where(
      and(
        eq(teamScheduledMessages.status, 'active'),
        isNotNull(teamScheduledMessages.nextRunAt),
        lte(teamScheduledMessages.nextRunAt, now),
      ),
    );

  if (!dueMsgs.length) {
    return NextResponse.json({ ok: true, processed: 0, aappSpace });
  }

  let processed = 0;
  const errors: Array<{ id: number; error: string }> = [];

  for (const msg of dueMsgs) {
    try {
      // Get instance
      if (!msg.instanceId) {
        await failScheduledMessage(
          msg.id,
          'El programado no tiene ninguna instancia de WhatsApp asignada, así que no hay número desde el cual enviar. '
          + 'Editalo y elegí una instancia conectada.',
        );
        continue;
      }

      // El filtro por `teamId` es la barrera final: en la base pueden quedar
      // programados de antes del arreglo apuntando a la instancia de otro
      // equipo. Sin esta condición, el cron mandaba con ese token ajeno.
      const instance = await db.query.evolutionInstances.findFirst({
        where: and(eq(evolutionInstances.id, msg.instanceId), eq(evolutionInstances.teamId, msg.teamId)),
        columns: { accessToken: true, instanceName: true, id: true, teamId: true },
      });

      if (!instance || !instance.accessToken) {
        await failScheduledMessage(
          msg.id,
          instance
            ? `La instancia "${instance.instanceName}" no tiene token de acceso: volvé a conectarla desde Ajustes.`
            : `La instancia #${msg.instanceId} ya no existe. Editá el programado y elegí otra.`,
        );
        continue;
      }

      const numbers = (msg.targetNumbers as string[]) ?? [];
      const recipientErrors: string[] = [];

      for (const rawNum of numbers) {
        try {
          const jid = toJid(rawNum);
          const chat = await findOrCreateChat(msg, jid);
          if (!chat) {
            throw new Error(`Could not resolve chat for ${jid}`);
          }

          if (msg.actionType === 'message' && msg.message) {
            const phone = toPhoneNumber(rawNum);
            const apiUrl = `${EVOLUTION_API_URL}/message/sendText/${instance.instanceName}`;
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: instance.accessToken,
              },
              body: JSON.stringify({
                number: phone,
                text: msg.message,
              }),
              signal: AbortSignal.timeout(10000),
            });

            const responseData = await response.json().catch(() => null);
            const messageId = responseData?.key?.id;
            if (!response.ok || !messageId) {
              throw new Error(responseData?.message || `Evolution returned ${response.status}`);
            }

            const timestamp = new Date();
            const scheduledMessage = {
              id: messageId,
              chatId: chat.id,
              fromMe: true,
              messageType: 'scheduled',
              text: msg.message,
              timestamp,
              status: 'sent' as const,
              isInternal: false,
              isAi: false,
              isAutomation: false,
            };

            const [savedMessage] = await db
              .insert(messages)
              .values(scheduledMessage)
              .onConflictDoUpdate({
                target: messages.id,
                set: {
                  chatId: chat.id,
                  fromMe: true,
                  messageType: 'scheduled',
                  text: msg.message,
                  status: 'sent',
                },
              })
              .returning();

            await db
              .update(chats)
              .set({
                lastMessageText: msg.message,
                lastMessageTimestamp: timestamp,
                lastMessageFromMe: true,
                lastMessageStatus: 'sent',
                unreadCount: 0,
              })
              .where(eq(chats.id, chat.id));

            const channel = `team-${msg.teamId}`;
            await safePusherTrigger(channel, 'new-message', {
              ...(savedMessage ?? scheduledMessage),
              timestamp: (savedMessage?.timestamp ?? timestamp).toISOString(),
              remoteJid: jid,
              instance: instance.instanceName,
              instanceId: instance.id,
            });
            await safePusherTrigger(channel, 'message-origin-update', {
              messageId,
              messageType: 'scheduled',
            });
            await safePusherTrigger(channel, 'chat-list-update', {
              id: chat.id,
              remoteJid: jid,
              instanceId: instance.id,
              lastMessageText: msg.message,
              lastMessageTimestamp: timestamp.toISOString(),
              lastMessageFromMe: true,
              lastMessageStatus: 'sent',
              unreadCount: 0,
            });
          } else if (msg.actionType === 'automation' && msg.automationId) {
            await triggerAutomationManually(
              msg.teamId,
              chat.id,
              jid,
              msg.instanceId!,
              { automationId: msg.automationId },
            );
          }
        } catch (numErr) {
          console.error(`[cron/send-scheduled] Error sending to ${rawNum}:`, numErr);
          recipientErrors.push(`${rawNum}: ${numErr instanceof Error ? numErr.message : String(numErr)}`);
        }
      }

      // Un programado que no le llegó a nadie no está "completado". Antes se
      // marcaba igual y el único rastro del fallo eran los logs del cron.
      if (numbers.length > 0 && recipientErrors.length === numbers.length) {
        await failScheduledMessage(
          msg.id,
          `No se pudo enviar a ninguno de los ${numbers.length} destinatarios. ${summarizeErrors(recipientErrors)}`,
          { runCount: (msg.runCount ?? 0) + 1, lastRunAt: now },
        );
        errors.push({ id: msg.id, error: recipientErrors[0] });
        continue;
      }

      // Update tracking fields
      const newRunCount = (msg.runCount ?? 0) + 1;
      const maxRuns = msg.maxRuns;
      const isCompleted =
        msg.scheduleType === 'once' || (maxRuns !== null && maxRuns !== undefined && newRunCount >= maxRuns);

      const nextRunAt = isCompleted ? null : computeNextRunAt(msg);

      await db
        .update(teamScheduledMessages)
        .set({
          runCount: newRunCount,
          lastRunAt: now,
          nextRunAt,
          status: isCompleted ? 'completed' : 'active',
          lastError: recipientErrors.length ? summarizeErrors(recipientErrors) : null,
          updatedAt: new Date(),
        })
        .where(eq(teamScheduledMessages.id, msg.id));

      processed++;
    } catch (err) {
      console.error(`[cron/send-scheduled] Error processing msg ${msg.id}:`, err);
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: msg.id, error: message });
      await failScheduledMessage(msg.id, message).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, processed, errors: errors.length ? errors : undefined, aappSpace });
}
