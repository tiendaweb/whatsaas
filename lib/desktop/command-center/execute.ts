import { createHash } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, contacts, teamDeals, teamTaskItems, users } from '@/lib/db/schema';
import type { PermissionContext } from '@/lib/auth/permissions-guard';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { resolveScopedChats } from '@/lib/desktop/scope';
import { markChatsRead } from '@/lib/chats/mark-read';
import { sendTeamTextMessage } from '@/lib/messaging/send';
import { patchTaskItem } from '@/lib/plugins/tasks/server/task-os';
import { moveDeal } from '@/lib/deals/service';
import { updateCrm } from '@/lib/plugins/sales-ops/server/crm';
import { assignContact, changeContactTags } from '@/lib/contacts/quick-actions';
import { createContactTask } from '@/lib/plugins/tasks/server/contact-tasks';
import { writeInternalNote } from '@/lib/plugins/grok-connector/server/actions';
import { MembershipRenewError, renewSubscription } from '@/lib/plugins/memberships/server/renew';
import { FinanceEntryError, settleFinancialEntry } from '@/lib/plugins/finance/server/entries';
import {
  BATCH_DEAL_STAGES,
  maskJid,
  type BatchResponse,
  type BatchResultRow,
  type PlannedAction,
} from './types';

const DAY = 86400000;

export type ExecuteInput = {
  batchId: string;
  actions: PlannedAction[];
  /** true = sólo valida, y esta función no puede enviar nada. */
  validation: boolean;
};

/**
 * La clave idempotente la DERIVA el servidor a partir del lote y del chat, nunca
 * la manda el cliente.
 *
 * Por lote y no por contenido: `team_message_send_keys` no caduca, así que una
 * clave que sale del texto hace que el mismo recordatorio del mes que viene se
 * trague en silencio y la UI lo pinte "ya enviado". Con el `batchId` —uuid que
 * se crea al abrir la revisión y se reusa en el reintento— quedan cubiertos el
 * doble clic, el F5 y el reintento, y mañana el mismo texto sí sale.
 */
function idempotencyKey(batchId: string, target: number | string): string {
  return `cc:${createHash('sha256').update(`${batchId}:${target}`).digest('hex').slice(0, 24)}`;
}

export async function executeCommandBatch(
  ctx: PermissionContext,
  input: ExecuteInput,
): Promise<BatchResponse> {
  const isOwner = ctx.role === 'owner' || ctx.role === 'admin';
  const can = (permission: boolean) => isOwner || permission;
  const active = new Set((await resolveActivePluginsForTeam(ctx.teamId, ctx.userId)).map((item) => item.pluginId));

  const results: BatchResultRow[] = [];
  const sends = input.actions.filter((item) => item.action.type === 'send-message');
  const rest = input.actions.filter((item) => item.action.type !== 'send-message');

  // Dos mensajes al mismo chat en el mismo lote es el caso que produce el
  // "tres mensajes seguidos al mismo cliente": se rechaza el segundo.
  const seenChats = new Set<number>();

  // Toda acción que lleva `chatId` pasa por el mismo filtro de visibilidad: si
  // se olvida una, esa acción se convierte en la puerta lateral para tocar un
  // chat que la persona no puede ver.
  const chatIds = input.actions
    .map((item) => ('chatId' in item.action ? item.action.chatId : null))
    .filter((id): id is number => typeof id === 'number');
  const scoped = await resolveScopedChats(ctx, chatIds);

  const [signer] = await db
    .select({ name: users.name, enableSignature: users.enableSignature })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);
  const signatureName = signer?.enableSignature && signer.name ? signer.name : null;

  // ── Reversibles ───────────────────────────────────────────────────────────
  const readIds: Array<{ itemId: string; chatId: number }> = [];
  for (const planned of rest) {
    const { action } = planned;
    if (action.type === 'mark-chat-read') {
      if (!scoped.has(action.chatId)) {
        results.push({ itemId: planned.itemId, ok: false, error: 'out_of_scope' });
        continue;
      }
      readIds.push({ itemId: planned.itemId, chatId: action.chatId });
      continue;
    }
    if (action.type === 'complete-task' || action.type === 'snooze-task' || action.type === 'set-task-ai-detail') {
      if (!active.has('tasks')) {
        results.push({ itemId: planned.itemId, ok: false, error: 'plugin_off' });
        continue;
      }
      if (!can(ctx.permissions.tasksWrite)) {
        results.push({ itemId: planned.itemId, ok: false, error: 'permission_denied' });
        continue;
      }
      results.push(await runTaskAction(ctx, planned, input.validation));
      continue;
    }
    if (action.type === 'move-deal-stage') {
      if (!active.has('deals')) {
        results.push({ itemId: planned.itemId, ok: false, error: 'plugin_off' });
        continue;
      }
      if (!can(ctx.permissions.dealsWrite)) {
        results.push({ itemId: planned.itemId, ok: false, error: 'permission_denied' });
        continue;
      }
      if (!BATCH_DEAL_STAGES.includes(action.stage)) {
        // Cerrar una oportunidad emite venta y exige `salesWrite`: no pasa por acá.
        results.push({ itemId: planned.itemId, ok: false, error: 'invalid' });
        continue;
      }
      const [deal] = await db
        .select({ id: teamDeals.id })
        .from(teamDeals)
        .where(and(eq(teamDeals.teamId, ctx.teamId), eq(teamDeals.id, action.dealId)))
        .limit(1);
      if (!deal) {
        results.push({ itemId: planned.itemId, ok: false, error: 'not_found' });
        continue;
      }
      if (input.validation) {
        results.push({ itemId: planned.itemId, ok: true });
        continue;
      }
      const moved = await moveDeal(ctx.teamId, action.dealId, { stage: action.stage, position: 0 }, ctx.userId);
      results.push(
        moved
          ? { itemId: planned.itemId, ok: true }
          : { itemId: planned.itemId, ok: false, error: 'not_found' },
      );
      continue;
    }
    if (action.type === 'renew-membership' || action.type === 'settle-entry') {
      results.push(await runMoneyAction(ctx, planned, active, can, input));
      continue;
    }
    if (
      action.type === 'set-crm-stage'
      || action.type === 'change-contact-tags'
      || action.type === 'assign-contact'
      || action.type === 'add-internal-note'
      || action.type === 'create-task'
    ) {
      results.push(await runContactAction(ctx, planned, scoped, active, can, input.validation));
      continue;
    }
    results.push({ itemId: planned.itemId, ok: false, error: 'invalid' });
  }

  if (readIds.length) {
    if (input.validation) {
      for (const row of readIds) results.push({ itemId: row.itemId, ok: true });
    } else {
      const done = new Set(await markChatsRead(ctx.teamId, readIds.map((row) => row.chatId)));
      for (const row of readIds) {
        results.push(
          done.has(row.chatId)
            ? { itemId: row.itemId, ok: true }
            : { itemId: row.itemId, ok: false, error: 'not_found' },
        );
      }
    }
  }

  // ── Envíos ────────────────────────────────────────────────────────────────
  for (const planned of sends) {
    if (planned.action.type !== 'send-message') continue;
    const { chatId, text, source, suggestionId } = planned.action;
    const target = scoped.get(chatId);
    if (!can(ctx.permissions.messagesSend)) {
      results.push({ itemId: planned.itemId, ok: false, error: 'permission_denied' });
      continue;
    }
    if (!target) {
      results.push({ itemId: planned.itemId, ok: false, error: 'out_of_scope' });
      continue;
    }
    const body = text.trim();
    if (!body || body.length > 4000) {
      results.push({ itemId: planned.itemId, ok: false, error: 'invalid' });
      continue;
    }
    if (seenChats.has(chatId)) {
      results.push({ itemId: planned.itemId, ok: false, error: 'duplicate_recipient' });
      continue;
    }
    seenChats.add(chatId);

    if (input.validation) {
      results.push({
        itemId: planned.itemId,
        ok: true,
        // El destinatario que ve la revisión sale de la base, no del cliente.
        recipient: { name: target.contactName ?? target.remoteJid, masked: maskJid(target.remoteJid) },
        signatureName,
      });
      continue;
    }

    try {
      const sent = await sendTeamTextMessage(ctx.teamId, {
        recipientJid: target.remoteJid,
        text: body,
        signatureName,
        origin: 'user',
        idempotencyKey: idempotencyKey(input.batchId, chatId),
        // El inbox no participó de este envío: sin broadcast, el chat no se
        // actualiza para nadie.
        broadcast: true,
      });
      results.push(
        sent.ok
          ? { itemId: planned.itemId, ok: true, idempotent: sent.idempotent }
          : {
              itemId: planned.itemId,
              ok: false,
              error: 'send_failed',
              message: sent.errorMessage ?? undefined,
              href: `/dashboard/chat/${encodeURIComponent(target.remoteJid)}`,
            },
      );
      await audit(ctx, planned.itemId, {
        chatId,
        contactName: target.contactName,
        textPreview: body.slice(0, 160),
        textHash: createHash('sha256').update(body).digest('hex').slice(0, 16),
        source,
        suggestionId: suggestionId ?? null,
        editedByHuman: source === 'custom',
        batchId: input.batchId,
        ok: sent.ok,
        idempotent: sent.idempotent,
      });
    } catch (error) {
      // Un timeout o un abort NO significa que no haya salido: reintentar acá es
      // duplicar exactamente en el caso para el que existe el botón.
      const message = error instanceof Error ? error.message : String(error);
      const indeterminate = /abort|timeout|fetch failed|network/i.test(message);
      results.push({
        itemId: planned.itemId,
        ok: false,
        error: indeterminate ? 'send_unknown' : 'send_failed',
        message,
        href: `/dashboard/chat/${encodeURIComponent(target.remoteJid)}`,
      });
      await audit(ctx, planned.itemId, {
        chatId,
        contactName: target.contactName,
        textPreview: body.slice(0, 160),
        source,
        batchId: input.batchId,
        ok: false,
        error: message.slice(0, 200),
      });
    }
  }

  const okCount = results.filter((row) => row.ok).length;
  return { results, okCount, failCount: results.length - okCount, validation: input.validation };
}

/**
 * Las acciones que operan sobre el contacto del chat.
 *
 * Todas comparten tres cosas: el chat tiene que estar dentro de la visibilidad
 * de la persona (`scoped`), el contacto lo resuelve el servidor a partir del
 * chat, y ninguna sale del equipo — la nota interna incluida, que se ve en la
 * conversación pero nunca se le manda al cliente.
 */
/**
 * Las acciones que mueven plata: renovar una suscripción y registrar un cobro o
 * un pago.
 *
 * Toda la regla vive en `lib/plugins/memberships/server/renew.ts` y
 * `lib/plugins/finance/server/entries.ts`, que son las mismas funciones que usa
 * el conector. Acá sólo se chequea permiso y plugin, se deriva la clave
 * idempotente del lote y se traduce el resultado.
 *
 * La clave sale del `batchId` + el ítem, igual que en los envíos: reintentar un
 * lote que se cortó a la mitad no cobra dos veces.
 */
async function runMoneyAction(
  ctx: PermissionContext,
  planned: PlannedAction,
  active: Set<string>,
  can: (permission: boolean) => boolean,
  input: ExecuteInput,
): Promise<BatchResultRow> {
  const { action } = planned;
  const key = idempotencyKey(input.batchId, planned.itemId);

  try {
    if (action.type === 'renew-membership') {
      if (!active.has('memberships')) return { itemId: planned.itemId, ok: false, error: 'plugin_off' };
      if (!can(ctx.permissions.membershipsWrite)) return { itemId: planned.itemId, ok: false, error: 'permission_denied' };
      // Registrar el cobro además de correr la fecha exige el permiso de
      // Finanzas: renovar y facturar son dos autorizaciones distintas.
      if (action.recordPayment && !(active.has('finance') && can(ctx.permissions.financeWrite))) {
        return {
          itemId: planned.itemId,
          ok: false,
          error: 'permission_denied',
          message: 'Registrar el cobro junto con la renovación necesita el permiso financeWrite y la app Finanzas activa.',
        };
      }
      const resultado = await renewSubscription(ctx.teamId, ctx.userId, {
        subscription_id: action.subscriptionId,
        new_end_date: action.newEndDate,
        payment_status: action.paymentStatus,
        record_payment: action.recordPayment,
        amount: action.amount,
        account_id: action.accountId ?? null,
        idempotency_key: key,
        dry_run: input.validation,
      });
      if (!resultado.dryRun) {
        await audit(ctx, planned.itemId, {
          action: 'renew-membership',
          subscriptionId: action.subscriptionId,
          newEndDate: action.newEndDate,
          recordedPayment: Boolean(action.recordPayment),
          batchId: input.batchId,
        });
      }
      return { itemId: planned.itemId, ok: true };
    }

    if (!active.has('finance')) return { itemId: planned.itemId, ok: false, error: 'plugin_off' };
    if (!can(ctx.permissions.financeWrite)) return { itemId: planned.itemId, ok: false, error: 'permission_denied' };
    if (action.type !== 'settle-entry') return { itemId: planned.itemId, ok: false, error: 'invalid' };

    const resultado = await settleFinancialEntry(ctx.teamId, ctx.userId, {
      entry_id: action.entryId,
      amount: action.amount,
      paid_on: action.paidOn,
      account_id: action.accountId ?? null,
      method: action.method ?? null,
      notes: action.notes ?? null,
      idempotency_key: key,
      dry_run: input.validation,
    });
    if (!input.validation && !resultado.idempotent) {
      await audit(ctx, planned.itemId, {
        action: 'settle-entry',
        entryId: action.entryId,
        amount: action.amount,
        paidOn: action.paidOn,
        batchId: input.batchId,
      });
    }
    return { itemId: planned.itemId, ok: true, idempotent: resultado.idempotent || undefined };
  } catch (error) {
    if (error instanceof MembershipRenewError || error instanceof FinanceEntryError) {
      return { itemId: planned.itemId, ok: false, error: 'invalid', message: error.message };
    }
    throw error;
  }
}

async function runContactAction(
  ctx: PermissionContext,
  planned: PlannedAction,
  scoped: Map<number, { remoteJid: string; contactName: string | null }>,
  active: Set<string>,
  can: (permission: boolean) => boolean,
  validation: boolean,
): Promise<BatchResultRow> {
  const { action } = planned;
  if (!('chatId' in action)) return { itemId: planned.itemId, ok: false, error: 'invalid' };
  if (!scoped.has(action.chatId)) return { itemId: planned.itemId, ok: false, error: 'out_of_scope' };

  if (action.type === 'create-task') {
    if (!active.has('tasks')) return { itemId: planned.itemId, ok: false, error: 'plugin_off' };
    if (!can(ctx.permissions.tasksWrite)) return { itemId: planned.itemId, ok: false, error: 'permission_denied' };
  } else if (!can(ctx.permissions.contacts)) {
    return { itemId: planned.itemId, ok: false, error: 'permission_denied' };
  }

  const [contact] = await db
    .select({ id: contacts.id, chatId: contacts.chatId })
    .from(contacts)
    .where(and(eq(contacts.teamId, ctx.teamId), eq(contacts.chatId, action.chatId)))
    .limit(1);
  if (!contact) {
    return {
      itemId: planned.itemId,
      ok: false,
      error: 'not_found',
      message: 'Este chat todavía no tiene ficha de contacto.',
    };
  }

  if (validation) return { itemId: planned.itemId, ok: true };

  try {
    if (action.type === 'set-crm-stage') {
      // Se reusa `updateCrm`, que ya valida que la etapa sea del equipo. No se
      // escribe una quinta versión del cambio de etapa.
      await updateCrm(ctx.teamId, ctx.userId, action.chatId, { funnelStageId: action.funnelStageId });
      await audit(ctx, planned.itemId, { chatId: action.chatId, action: action.type, funnelStageId: action.funnelStageId });
      return { itemId: planned.itemId, ok: true };
    }

    if (action.type === 'change-contact-tags') {
      const result = await changeContactTags(ctx.teamId, contact.id, { add: action.add, remove: action.remove });
      await audit(ctx, planned.itemId, { chatId: action.chatId, action: action.type, added: result.added, removed: result.removed });
      return { itemId: planned.itemId, ok: true };
    }

    if (action.type === 'assign-contact') {
      await assignContact(ctx.teamId, contact.id, {
        ...(action.assignedUserId !== undefined ? { assignedUserId: action.assignedUserId } : {}),
        ...(action.assignedDepartmentId !== undefined ? { assignedDepartmentId: action.assignedDepartmentId } : {}),
      });
      await audit(ctx, planned.itemId, {
        chatId: action.chatId,
        action: action.type,
        assignedUserId: action.assignedUserId ?? null,
        assignedDepartmentId: action.assignedDepartmentId ?? null,
      });
      return { itemId: planned.itemId, ok: true };
    }

    if (action.type === 'add-internal-note') {
      const target = scoped.get(action.chatId)!;
      // La clave idempotente sale del lote, igual que en los envíos: el doble
      // clic y el F5 no dejan la nota escrita dos veces.
      await writeInternalNote(
        { teamId: ctx.teamId, userId: ctx.userId },
        { id: contact.id, chatId: contact.chatId, chat: { remoteJid: target.remoteJid } },
        action.text,
        `cc-note:${planned.itemId}`,
      );
      await audit(ctx, planned.itemId, { chatId: action.chatId, action: action.type, source: action.source });
      return { itemId: planned.itemId, ok: true };
    }

    if (action.type !== 'create-task') return { itemId: planned.itemId, ok: false, error: 'invalid' };
    const created = await createContactTask({
      teamId: ctx.teamId,
      userId: ctx.userId,
      contactId: contact.id,
      title: action.title,
      notes: action.notes,
      dueDate: action.dueDate ?? null,
    });
    if ('error' in created) {
      return { itemId: planned.itemId, ok: false, error: 'not_found', message: created.error };
    }
    await audit(ctx, planned.itemId, { chatId: action.chatId, action: 'create-task', taskId: created.task.id });
    return { itemId: planned.itemId, ok: true };
  } catch (error) {
    return {
      itemId: planned.itemId,
      ok: false,
      error: 'invalid',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTaskAction(
  ctx: PermissionContext,
  planned: PlannedAction,
  validation: boolean,
): Promise<BatchResultRow> {
  const { action } = planned;
  if (action.type !== 'complete-task' && action.type !== 'snooze-task' && action.type !== 'set-task-ai-detail') {
    return { itemId: planned.itemId, ok: false, error: 'invalid' };
  }
  const [task] = await db
    .select({ id: teamTaskItems.id, dueDate: teamTaskItems.dueDate })
    .from(teamTaskItems)
    .where(and(eq(teamTaskItems.teamId, ctx.teamId), eq(teamTaskItems.id, action.taskId)))
    .limit(1);
  if (!task) return { itemId: planned.itemId, ok: false, error: 'not_found' };
  if (validation) return { itemId: planned.itemId, ok: true };

  if (action.type === 'set-task-ai-detail') {
    const text = action.text.trim();
    if (!text || text.length > 20000) return { itemId: planned.itemId, ok: false, error: 'invalid' };
    // Escribir el próximo paso (o contestar la pregunta que destraba la tarea)
    // la entrega a los conectores: `whatspro_tasks_ai_worklist` sólo ve tareas
    // con `ai_ready_at`. Sin esto, lo que se escribía acá no salía nunca de
    // esta pantalla. La pregunta NO arma: le falta la respuesta humana.
    const result = await patchTaskItem({
      teamId: ctx.teamId,
      taskId: action.taskId,
      patch: action.field === 'next-step'
        ? { aiNextStep: text, aiReadyAt: new Date().toISOString() }
        : action.field === 'context-question'
          ? { aiContextQuestion: text, aiContextAnswer: '' }
          : { aiContextAnswer: text, aiReadyAt: new Date().toISOString() },
    });
    if ('error' in result) return { itemId: planned.itemId, ok: false, error: 'not_found', message: result.error };
    await audit(ctx, planned.itemId, {
      taskId: action.taskId,
      action: action.type,
      field: action.field,
      source: action.source,
      suggestionId: action.suggestionId ?? null,
    });
    return { itemId: planned.itemId, ok: true };
  }

  if (action.type === 'complete-task') {
    // Nunca se manda `checklist` en el lote: si llega completo y sin `status`,
    // `patchTaskItem` pone 'done' por su cuenta.
    const result = await patchTaskItem({ teamId: ctx.teamId, taskId: action.taskId, patch: { status: 'done' } });
    if ('error' in result) return { itemId: planned.itemId, ok: false, error: 'not_found', message: result.error };
    await audit(ctx, planned.itemId, { taskId: action.taskId, action: 'complete-task' });
    return { itemId: planned.itemId, ok: true };
  }

  const days = Math.trunc(action.days);
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return { itemId: planned.itemId, ok: false, error: 'invalid' };
  }
  // Sobre la fecha original, no sobre hoy: posponer una tarea que vence dentro
  // de una semana no puede ADELANTARLE el vencimiento.
  const base = task.dueDate && task.dueDate.getTime() > Date.now() ? task.dueDate.getTime() : Date.now();
  const next = new Date(base + days * DAY);
  if (!Number.isFinite(next.getTime())) return { itemId: planned.itemId, ok: false, error: 'invalid' };
  const result = await patchTaskItem({
    teamId: ctx.teamId,
    taskId: action.taskId,
    patch: { dueDate: next.toISOString() },
  });
  if ('error' in result) return { itemId: planned.itemId, ok: false, error: 'not_found', message: result.error };
  // La fecha anterior sólo sobrevive acá: `dueDate` se pisa.
  await audit(ctx, planned.itemId, {
    taskId: action.taskId,
    action: 'snooze-task',
    days,
    previousDueDate: task.dueDate?.toISOString() ?? null,
    newDueDate: next.toISOString(),
  });
  return { itemId: planned.itemId, ok: true };
}

async function audit(ctx: PermissionContext, itemId: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({
      teamId: ctx.teamId,
      userId: ctx.userId,
      action: 'DESKTOP_COMMAND_BATCH',
      // En `metadata`, no en `ipAddress`.
      metadata: { itemId, ...metadata },
    });
  } catch (error) {
    console.error('[command-center] audit failed', error);
  }
}
