import 'server-only';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, messages, teamCommercialActions } from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';
import { sendTeamTextMessage } from '@/lib/messaging/send';
import { createContactTask } from '@/lib/plugins/tasks/server/contact-tasks';
import { createDemoTask } from './demos';
import { scheduleActionMessage } from './scheduled';
import { markResult } from './queue';

/**
 * Fase 6: ejecutar desde el servidor lo que una persona ya aprobó.
 *
 * Hasta acá, aprobar un lote dejaba las acciones en `approved` y alguien tenía
 * que mandarlas a mano o pedirle a un conector que las drenara. Eso sigue
 * funcionando (la cola de conectores no cambia); esto agrega el camino directo.
 *
 * Los cinco seguros, que no se aflojan:
 *  1. Sólo se ejecuta lo que está en `approved`. Nada salta la aprobación.
 *  2. Un envío por acción, con clave idempotente derivada del id de la acción:
 *     doble clic, F5 y reintento producen un solo mensaje.
 *  3. Antes de cada envío se vuelve a mirar si el cliente escribió DESPUÉS de
 *     la aprobación. Si escribió, se saltea: el texto aprobado contestaba a
 *     otra cosa.
 *  4. Un timeout NO se reintenta. Queda `failed` con `send_unknown` y lo mira
 *     una persona: reintentar a ciegas es cómo se mandan mensajes duplicados.
 *  5. El destinatario lo resuelve el servidor desde `chats.remoteJid`; el
 *     cliente sólo manda el `batchId`.
 */

export type ExecuteOutcome = {
  actionId: number;
  chatId: number;
  name: string;
  status: 'executed' | 'skipped' | 'failed';
  reason?: string;
  messageId?: string | null;
};

export type ExecuteBatchResult = {
  batchId: string;
  executed: number;
  skipped: number;
  failed: number;
  results: ExecuteOutcome[];
};

/** Cuántas acciones se ejecutan por request. Más que esto pide otro click. */
const MAX_POR_TANDA = 25;

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/execute] audit', error);
  }
}

/** ¿El cliente escribió después de que se aprobó esto? */
async function clienteRespondioDespues(teamId: number, chatId: number, desde: Date | null): Promise<boolean> {
  if (!desde) return false;
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(chats, eq(chats.id, messages.chatId))
    .where(and(eq(chats.teamId, teamId), eq(messages.chatId, chatId), eq(messages.fromMe, false), gt(messages.timestamp, desde)))
    .orderBy(desc(messages.timestamp))
    .limit(1);
  return Boolean(row);
}

/**
 * Ejecuta las acciones aprobadas de un lote.
 *
 * Devuelve una fila por acción con qué pasó, para que la pantalla pueda decir
 * "enviados 8 · salteados 2 (respondieron) · fallidos 1" en vez de un "listo"
 * que no distingue.
 */
export async function executeApprovedBatch(
  teamId: number,
  userId: number,
  batchId: string,
  opts: { actionIds?: number[] } = {},
): Promise<ExecuteBatchResult> {
  const conditions = [eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.batchId, batchId), eq(teamCommercialActions.status, 'approved')];
  if (opts.actionIds?.length) conditions.push(inArray(teamCommercialActions.id, opts.actionIds));

  const rows = await db
    .select({
      id: teamCommercialActions.id,
      kind: teamCommercialActions.kind,
      chatId: teamCommercialActions.chatId,
      contactId: teamCommercialActions.contactId,
      payload: teamCommercialActions.payload,
      approvedAt: teamCommercialActions.approvedAt,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
      pushName: chats.pushName,
      instanceId: chats.instanceId,
    })
    .from(teamCommercialActions)
    .innerJoin(chats, eq(chats.id, teamCommercialActions.chatId))
    .where(and(...conditions))
    .orderBy(teamCommercialActions.id)
    .limit(MAX_POR_TANDA);

  const results: ExecuteOutcome[] = [];

  for (const row of rows) {
    const name = row.chatName || row.pushName || maskJid(row.remoteJid);
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const base = { actionId: row.id, chatId: row.chatId, name };

    try {
      if (row.kind === 'send_message') {
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (!text) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'sin_texto' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: 'La acción no tiene texto.' });
          continue;
        }
        if (await clienteRespondioDespues(teamId, row.chatId, row.approvedAt)) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'customer_replied' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'skipped', reason: 'El cliente escribió después de la aprobación.' });
          continue;
        }

        const outcome = await sendTeamTextMessage(teamId, {
          recipientJid: row.remoteJid,
          text,
          idempotencyKey: `sales-ops:${row.id}`,
          origin: 'user',
        });
        if (!outcome.ok) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: outcome.errorMessage ?? 'send_failed' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: outcome.errorMessage ?? 'No se pudo enviar.' });
          continue;
        }
        await markResult(teamId, row.id, { status: 'executed', resultMessageId: outcome.message?.id ?? null, executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed', messageId: outcome.message?.id ?? null });
        continue;
      }

      if (row.kind === 'create_task') {
        if (!row.contactId) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'sin_contacto' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: 'El chat no tiene contacto asociado.' });
          continue;
        }
        const title = typeof payload.taskTitle === 'string' && payload.taskTitle.trim() ? payload.taskTitle.trim() : `Seguimiento — ${name}`;
        const due = typeof payload.dueAt === 'string' ? payload.dueAt : typeof payload.dueDate === 'string' ? payload.dueDate : null;
        const created = await createContactTask({
          teamId,
          userId,
          contactId: row.contactId,
          title: title.slice(0, 200),
          notes: typeof payload.text === 'string' ? payload.text.slice(0, 2000) : undefined,
          dueDate: due,
        });
        if ('error' in created) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: created.error }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: created.error });
          continue;
        }
        await markResult(teamId, row.id, { status: 'executed', executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed' });
        continue;
      }

      if (row.kind === 'schedule_message') {
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        const sendAt = typeof payload.sendAt === 'string' ? new Date(payload.sendAt) : null;
        if (!text || !sendAt || Number.isNaN(sendAt.getTime())) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'sin_texto_o_fecha' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: 'La acción no tiene texto o fecha de salida.' });
          continue;
        }
        if (await clienteRespondioDespues(teamId, row.chatId, row.approvedAt)) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'customer_replied' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'skipped', reason: 'El cliente escribió después de la aprobación.' });
          continue;
        }
        const scheduled = await scheduleActionMessage({ teamId, userId, actionId: row.id, remoteJid: row.remoteJid, instanceId: row.instanceId, name, text, sendAt });
        if ('error' in scheduled) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: scheduled.error }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: scheduled.error });
          continue;
        }
        await markResult(teamId, row.id, { status: 'executed', result: { scheduledMessageId: scheduled.id, sendAt: sendAt.toISOString() }, executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed' });
        continue;
      }

      if (row.kind === 'request_demo') {
        if (!row.contactId) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'sin_contacto' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: 'El chat no tiene contacto asociado.' });
          continue;
        }
        const demo = await createDemoTask({
          teamId,
          userId,
          chatId: row.chatId,
          contactId: row.contactId,
          name,
          brief: typeof payload.text === 'string' ? payload.text : undefined,
          title: typeof payload.taskTitle === 'string' ? payload.taskTitle : undefined,
          dueDate: typeof payload.dueAt === 'string' ? payload.dueAt : typeof payload.dueDate === 'string' ? payload.dueDate : null,
        });
        if ('error' in demo) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: demo.error }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: demo.error });
          continue;
        }
        await markResult(teamId, row.id, { status: 'executed', result: { taskId: demo.taskId, projectId: demo.projectId, promptSource: demo.promptSource }, executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed' });
        continue;
      }

      // El resto (registrar cobro, cambiar responsable, agendar) todavía lo hace
      // una persona o un conector: acá no se inventa una escritura de CRM.
      results.push({ ...base, status: 'skipped', reason: `"${row.kind}" se ejecuta desde la cola de conectores o a mano.` });
    } catch (error) {
      // Un timeout entra por acá. NO se reintenta: se marca y lo mira alguien.
      const message = error instanceof Error ? error.message : String(error);
      const esTimeout = /timeout|ETIMEDOUT|aborted/i.test(message);
      await markResult(teamId, row.id, {
        status: 'failed',
        result: { error: esTimeout ? 'send_unknown' : message.slice(0, 300) },
        executedVia: 'command-center',
        userId,
      });
      results.push({ ...base, status: 'failed', reason: esTimeout ? 'Timeout: no se sabe si salió. Revisá el chat antes de reintentar.' : message.slice(0, 200) });
    }
  }

  const executed = results.filter((r) => r.status === 'executed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  await audit(teamId, userId, 'SALES_OPS_BATCH_EXECUTED', { batchId, executed, skipped, failed });
  return { batchId, executed, skipped, failed, results };
}
