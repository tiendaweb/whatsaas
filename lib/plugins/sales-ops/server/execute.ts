import 'server-only';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, messages, teamCommercialActions, teamCommercialAnalysis } from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';
import { sendTeamTextMessage } from '@/lib/messaging/send';
import { createContactTask } from '@/lib/plugins/tasks/server/contact-tasks';
import { createEvent } from '@/lib/plugins/calendar/server/events';
import { HORA_LABORAL, desdeZona, fechaEnZona, proximoHorarioFuturo, sumarDias } from '@/lib/time/zona';
import { OWNERS, type Gate, type Owner } from '../shared/taxonomy';
import { setManualOverride } from './classifier';
import { createDemoTask, demoKindParaNecesidad, esDemoWorkKind, type DemoWorkKind } from './demos';
import { transferLead } from './lead';
import { scheduleActionMessage } from './scheduled';
import { markResult } from './queue';
import { CobroError, parsearImporte, registrarCobro } from './cobros';

/**
 * Fase 6: ejecutar desde el servidor lo que una persona ya aprobó.
 *
 * Hasta acá, aprobar un lote dejaba las acciones en `approved` y alguien tenía
 * que mandarlas a mano o pedirle a un conector que las drenara. Eso sigue
 * funcionando (la cola de conectores no cambia); esto agrega el camino directo.
 * Desde el 2026-09-05 aprobar desde la Cola llama a esto en el mismo request
 * (`SERVER_EXECUTABLE_KINDS`): lo que tiene el dato completo se hace al
 * aprobar, y sólo queda `approved` lo que falló o lo que necesita a alguien.
 *
 * Los cinco seguros, que no se aflojan (la cola de conectores sólo recibe lo que
 * el servidor no ejecutó: fallas y lo aprobado con `execute:false`):
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

/** Cuántas acciones se ejecutan por request si no se pide otra cosa. */
const MAX_POR_TANDA = 25;
/** Techo absoluto por request: un envío tarda ~1 s y la ruta tiene 300 s. */
const MAX_ABSOLUTO = 200;

/**
 * Los datos "extra" de una acción. `proposeBatch` los guardó aplanados en la
 * raíz del payload durante semanas y este archivo los leía de `payload.extra`,
 * que no existía: el motivo del pre-descarte y la hora de la llamada se
 * perdían. Ahora vienen de las dos formas; se leen de las dos.
 */
function extraDe(payload: Record<string, unknown>): Record<string, unknown> {
  const anidado = (payload.extra ?? {}) as Record<string, unknown>;
  return { ...payload, ...anidado };
}

/** Fecha de una acción (`sendAt`, `dueAt`, `at`, `dueDate`), o `null` si no hay ninguna válida. Un día solo = ese día a las 10, hora del negocio. */
function fechaDelPayload(payload: Record<string, unknown>): Date | null {
  const extra = extraDe(payload);
  for (const v of [payload.sendAt, payload.dueAt, extra.at, payload.dueDate, extra.dueDate]) {
    if (typeof v !== 'string' || !v) continue;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? desdeZona(v, HORA_LABORAL.porDefecto, 0) : new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Mañana a las 10 de la mañana, hora del negocio: el default de "agendar" cuando nadie puso hora. */
function mananaALasDiez(): Date {
  return desdeZona(sumarDias(fechaEnZona(), 1), HORA_LABORAL.porDefecto, 0);
}

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
  opts: { actionIds?: number[]; max?: number } = {},
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
    .limit(Math.min(Math.max(1, opts.max ?? MAX_POR_TANDA), MAX_ABSOLUTO));

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
        // El tipo de demo sale de lo que el análisis dice que el cliente
        // necesita: producción no puede adivinar si "demo" era un sitio o una
        // tienda, y los productos de AAPP SPACE no se convierten entre sí. Si
        // el lote ya trae un tipo explícito (lo eligió una persona o un
        // conector), ese manda; si no hay análisis, queda el default histórico.
        const [analisis] = await db
          .select({ need: teamCommercialAnalysis.need })
          .from(teamCommercialAnalysis)
          .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, row.chatId)))
          .limit(1);
        const pedido = extraDe(payload).workKind;
        const workKind: DemoWorkKind = esDemoWorkKind(pedido) ? pedido : demoKindParaNecesidad(analisis?.need);
        const demo = await createDemoTask({
          teamId,
          userId,
          chatId: row.chatId,
          contactId: row.contactId,
          name,
          brief: typeof payload.text === 'string' ? payload.text : undefined,
          title: typeof payload.taskTitle === 'string' ? payload.taskTitle : undefined,
          dueDate: typeof payload.dueAt === 'string' ? payload.dueAt : typeof payload.dueDate === 'string' ? payload.dueDate : null,
          workKind,
        });
        if ('error' in demo) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: demo.error }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: demo.error });
          continue;
        }
        await markResult(teamId, row.id, { status: 'executed', result: { taskId: demo.taskId, projectId: demo.projectId, promptSource: demo.promptSource, workKind }, executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed' });
        continue;
      }

      // Pre-descarte y descarte: el estado del análisis, con versión
      // `manual_override` firmada por quien aprobó. Es lo que hacía a mano
      // desde la ficha; el lote sólo lo aplica a varios de una vez.
      if (row.kind === 'mark_pre_descarte' || row.kind === 'mark_descarte') {
        const status = row.kind === 'mark_descarte' ? 'descarte_definitivo' : 'pre_descarte';
        const extra = extraDe(payload);
        const reason = [typeof extra.reason === 'string' ? extra.reason : null, typeof extra.rule === 'string' ? extra.rule : null, typeof payload.text === 'string' ? payload.text : null]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 300) || `Lote ${row.id}`;
        const [actual] = await db
          .select({ gate: teamCommercialAnalysis.currentGate })
          .from(teamCommercialAnalysis)
          .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, row.chatId)))
          .limit(1);
        const gate = (row.kind === 'mark_descarte' ? 'GX' : (actual?.gate as Gate | undefined) ?? 'G0') as Gate;
        await setManualOverride(teamId, row.chatId, userId, { gate, status, reason: reason.length >= 3 ? reason : `Lote ${row.id}` });
        await markResult(teamId, row.id, { status: 'executed', result: { status, gate }, executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed' });
        continue;
      }

      // Responsable: el mismo `transferLead` del menú ⋯ de las listas.
      if (row.kind === 'assign_owner') {
        const extra = extraDe(payload);
        const owner = (typeof extra.owner === 'string' ? extra.owner : '') as Owner;
        if (!OWNERS.includes(owner)) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'sin_responsable' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: 'La acción no dice a quién asignarlo.' });
          continue;
        }
        await transferLead(teamId, userId, row.chatId, owner);
        await markResult(teamId, row.id, { status: 'executed', result: { owner }, executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed' });
        continue;
      }

      // Llamada: un evento del Calendario, vinculado al contacto. Sin hora en
      // el payload va mañana a las 10; nadie pierde una llamada por no haber
      // puesto la hora, y moverla es un arrastre en el calendario.
      if (row.kind === 'schedule_call') {
        // Una llamada con la hora ya pasada se corre al próximo horario con sentido.
        const startsAt = proximoHorarioFuturo(fechaDelPayload(payload) ?? mananaALasDiez()).date;
        const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
        const evento = await createEvent(teamId, userId, {
          title: typeof payload.taskTitle === 'string' && payload.taskTitle.trim() ? payload.taskTitle.trim() : `Llamar a ${name}`,
          startsAt,
          endsAt,
          kind: 'call',
          notes: typeof payload.text === 'string' ? payload.text : `Command Center · lote ${row.id}`,
          contactId: row.contactId ?? null,
          reminderMinutes: [15],
        });
        await markResult(teamId, row.id, { status: 'executed', result: { eventId: evento.id, startsAt: startsAt.toISOString() }, executedVia: 'command-center', userId });
        results.push({ ...base, status: 'executed' });
        continue;
      }

      // Cobro: la persona que aprobó vio importe, moneda y medio en la fila.
      // `registrarCobro` deja consistentes venta, asiento, pago, cliente y
      // análisis (G11); idempotente por acción, así que un reintento no cobra dos veces.
      if (row.kind === 'register_sale') {
        const extra = extraDe(payload);
        const amount = parsearImporte(extra.amount);
        const currency = typeof extra.currency === 'string' ? extra.currency : '';
        if (!amount || !currency) {
          await markResult(teamId, row.id, { status: 'failed', result: { error: 'sin_importe' }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'failed', reason: 'La acción no tiene importe o moneda: editala antes de aprobar.' });
          continue;
        }
        try {
          const cobro = await registrarCobro(teamId, userId, {
            chatId: row.chatId,
            amount,
            currency,
            method: typeof extra.method === 'string' ? extra.method : null,
            paidOn: typeof extra.paidOn === 'string' ? extra.paidOn : null,
            concept: typeof extra.concept === 'string' ? extra.concept : typeof payload.text === 'string' ? payload.text.slice(0, 120) : null,
            saleId: typeof extra.saleId === 'number' ? extra.saleId : null,
            entryId: typeof extra.entryId === 'number' ? extra.entryId : null,
            receiptMessageId: typeof extra.receiptMessageId === 'string' ? extra.receiptMessageId : null,
            idempotencyKey: `sales-ops:${row.id}`,
            via: 'cola',
          });
          await markResult(teamId, row.id, { status: 'executed', result: { saleId: cobro.sale?.id ?? null, entryId: cobro.entry?.id ?? null, paymentId: cobro.paymentId, customerId: cobro.customer?.id ?? null, amount, currency, summary: cobro.summary }, executedVia: 'command-center', userId });
          results.push({ ...base, status: 'executed' });
        } catch (error) {
          if (error instanceof CobroError) {
            await markResult(teamId, row.id, { status: 'failed', result: { error: error.message.slice(0, 300) }, executedVia: 'command-center', userId });
            results.push({ ...base, status: 'failed', reason: error.message });
            continue;
          }
          throw error;
        }
        continue;
      }

      results.push({ ...base, status: 'skipped', reason: `"${row.kind}" no se puede ejecutar desde el servidor.` });
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
