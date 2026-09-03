import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  teamFinancialEntries,
  teamFinancialEntryPayments,
  teamMembershipSubscriptions,
  teamTaskColumns,
  teamTaskItems,
  teamTaskProjects,
  users,
} from '@/lib/db/schema';
import type { PermissionContext } from '@/lib/auth/permissions-guard';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { listDeals } from '@/lib/deals/service';
import { listEvents } from '@/lib/desktop/crm';
import { chatScope } from '@/lib/desktop/scope';
import { getAIProviderForTeam } from '@/lib/plugins/ai-chat/service';
import {
  COMMAND_ITEM_KINDS,
  type CommandAction,
  type CommandCenterPayload,
  type CommandItem,
  type CommandItemKind,
} from './types';

/** Cuota por kind y tope global: sin la cuota, cinco tareas vencidas se comen la
 *  bandeja entera y las membresías impagas no se ven nunca. */
const PER_KIND = 8;
const TOTAL = 30;
const DAY = 86400000;

/**
 * La fecha que propone el botón "Renovar": un período más, según cómo factura
 * esa suscripción. Se hace en UTC a mediodía porque `end_date` es un `date` puro
 * y armarlo con la hora local corre un día para atrás en UTC-3.
 */
function nextPeriodEnd(endDate: string, billingType: string | null): string {
  const base = new Date(`${endDate}T12:00:00Z`);
  const meses = billingType === 'annual' || billingType === 'yearly' ? 12
    : billingType === 'quarterly' ? 3
      : billingType === 'weekly' ? 0
        : 1;
  if (meses === 0) base.setUTCDate(base.getUTCDate() + 7);
  else base.setUTCMonth(base.getUTCMonth() + meses);
  return base.toISOString().slice(0, 10);
}

/**
 * La fecha por la que se ordena y se decide si un movimiento urge. `due_on` es
 * opcional y en la práctica casi nadie lo carga, así que cae en `occurred_on`.
 */
const FINANCE_REFERENCE_DATE = sql<string>`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn})`;

const iso = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

/**
 * `detail` viaja armado desde el servidor, igual que el bloque `now` del
 * Escritorio. Es la única cadena que no pasa por next-intl en esta pantalla; el
 * resto de la UI sí está en los tres idiomas.
 */
export async function getCommandCenter(
  ctx: PermissionContext,
  opts: { kinds?: CommandItemKind[]; limit?: number } = {},
): Promise<CommandCenterPayload> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * DAY).toISOString().slice(0, 10);
  const wanted = new Set<CommandItemKind>(opts.kinds?.length ? opts.kinds : [...COMMAND_ITEM_KINDS]);
  const limit = Math.min(Math.max(opts.limit ?? TOTAL, 1), TOTAL);

  const active = new Set((await resolveActivePluginsForTeam(ctx.teamId, ctx.userId)).map((item) => item.pluginId));
  const isOwner = ctx.role === 'owner' || ctx.role === 'admin';
  const can = (permission: boolean) => isOwner || permission;

  const canTasks = wanted.has('task') && active.has('tasks') && can(ctx.permissions.tasksRead);
  const canMemberships = wanted.has('membership') && active.has('memberships') && can(ctx.permissions.membershipsRead);
  const canDeals = wanted.has('deal') && active.has('deals') && can(ctx.permissions.dealsRead);
  const canFinance = wanted.has('finance') && active.has('finance') && can(ctx.permissions.financeRead);
  const canFinanceWrite = active.has('finance') && can(ctx.permissions.financeWrite);
  const canMembershipsWrite = active.has('memberships') && can(ctx.permissions.membershipsWrite);
  const canEvents = wanted.has('event') && active.has('calendar') && can(ctx.permissions.calendarRead);
  const canChats = wanted.has('chat');

  const scope = await chatScope(ctx);

  const [chatRows, chatTotal, taskRows, taskTotal, membershipRows, membershipTotal, dealRows, eventRows, userRow, financeRows, financeTotal] =
    await Promise.all([
      canChats
        ? db
            .select({
              id: chats.id,
              name: sql<string>`coalesce(${contacts.name}, ${chats.name}, ${chats.pushName}, ${chats.remoteJid})`,
              preview: chats.lastMessageText,
              unread: chats.unreadCount,
              at: chats.lastMessageTimestamp,
              remoteJid: chats.remoteJid,
            })
            .from(chats)
            .leftJoin(contacts, eq(contacts.chatId, chats.id))
            .where(and(scope, gt(chats.unreadCount, 0)))
            .orderBy(desc(chats.lastMessageTimestamp))
            .limit(PER_KIND * 3)
        : Promise.resolve([]),
      canChats
        ? db
            .select({ total: count() })
            .from(chats)
            .leftJoin(contacts, eq(contacts.chatId, chats.id))
            .where(and(scope, gt(chats.unreadCount, 0)))
        : Promise.resolve([{ total: 0 }]),
      canTasks
        ? db
            .select({
              id: teamTaskItems.id,
              title: teamTaskItems.title,
              notes: teamTaskItems.notes,
              aiPrompt: teamTaskItems.aiPrompt,
              aiNextStep: teamTaskItems.aiNextStep,
              aiContextQuestion: teamTaskItems.aiContextQuestion,
              aiContextAnswer: teamTaskItems.aiContextAnswer,
              dueAt: teamTaskItems.dueDate,
              project: teamTaskProjects.name,
              column: teamTaskColumns.title,
            })
            .from(teamTaskItems)
            .innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItems.projectId))
            .innerJoin(teamTaskColumns, eq(teamTaskColumns.id, teamTaskItems.columnId))
            .where(
              and(
                eq(teamTaskItems.teamId, ctx.teamId),
                ne(teamTaskItems.status, 'done'),
                isNull(teamTaskItems.aiReadyAt),
                // La bandeja es "lo mío": sin este filtro la cuota se llena con
                // el backlog de otra gente y deja de ser accionable.
                or(eq(teamTaskItems.assigneeId, ctx.userId), isNull(teamTaskItems.assigneeId)),
              ),
            )
            .orderBy(sql`${teamTaskItems.dueDate} asc nulls last`, desc(teamTaskItems.updatedAt))
            .limit(PER_KIND * 3)
        : Promise.resolve([]),
      canTasks
        ? db
            .select({ total: count() })
            .from(teamTaskItems)
            .where(
              and(
                eq(teamTaskItems.teamId, ctx.teamId),
                ne(teamTaskItems.status, 'done'),
                isNull(teamTaskItems.aiReadyAt),
                or(eq(teamTaskItems.assigneeId, ctx.userId), isNull(teamTaskItems.assigneeId)),
              ),
            )
        : Promise.resolve([{ total: 0 }]),
      canMemberships
        ? db
            .select({
              id: teamMembershipSubscriptions.id,
              contactId: teamMembershipSubscriptions.contactId,
              plan: teamMembershipSubscriptions.planNameSnapshot,
              paymentStatus: teamMembershipSubscriptions.paymentStatus,
              // `end_date` es `date` en modo string: se compara con string, no
              // con un Date, y se muestra sin hora para no correrse un día en
              // UTC-3.
              endDate: teamMembershipSubscriptions.endDate,
              billingType: teamMembershipSubscriptions.billingType,
              number: teamMembershipSubscriptions.subscriptionNumber,
            })
            .from(teamMembershipSubscriptions)
            .where(
              and(
                eq(teamMembershipSubscriptions.teamId, ctx.teamId),
                ne(teamMembershipSubscriptions.status, 'cancelled'),
                or(
                  eq(teamMembershipSubscriptions.paymentStatus, 'overdue'),
                  and(
                    gte(teamMembershipSubscriptions.endDate, today),
                    lte(teamMembershipSubscriptions.endDate, in30),
                  ),
                ),
              ),
            )
            .orderBy(sql`${teamMembershipSubscriptions.endDate} asc nulls last`)
            .limit(PER_KIND * 3)
        : Promise.resolve([]),
      canMemberships
        ? db
            .select({ total: count() })
            .from(teamMembershipSubscriptions)
            .where(
              and(
                eq(teamMembershipSubscriptions.teamId, ctx.teamId),
                ne(teamMembershipSubscriptions.status, 'cancelled'),
                or(
                  eq(teamMembershipSubscriptions.paymentStatus, 'overdue'),
                  and(
                    gte(teamMembershipSubscriptions.endDate, today),
                    lte(teamMembershipSubscriptions.endDate, in30),
                  ),
                ),
              ),
            )
        : Promise.resolve([{ total: 0 }]),
      // `stale` ya filtra en SQL (14 días sin moverse): hacerlo en memoria
      // después del limit perdería oportunidades estancadas en silencio.
      canDeals ? listDeals(ctx.teamId, { open: true, stale: true, limit: PER_KIND * 3 }) : Promise.resolve([]),
      canEvents ? listEvents(ctx.teamId, 7) : Promise.resolve([]),
      db
        .select({ name: users.name, email: users.email, enableSignature: users.enableSignature })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1),
      // Por cobrar y por pagar que ya vencieron o vencen dentro de 30 días.
      //
      // La fecha de referencia es `coalesce(due_on, occurred_on)` y NO `due_on`
      // a secas: en la base de este equipo los 92 asientos tienen `due_on` en
      // NULL, así que filtrar por vencimiento dejaba la lista vacía siempre. Un
      // movimiento pendiente cuya fecha ya pasó es algo que hay que cobrar,
      // tenga o no vencimiento cargado.
      //
      // El saldo pendiente resta los pagos parciales: un asiento con la mitad
      // cobrada no es lo mismo que uno intacto.
      canFinance
        ? db
            .select({
              id: teamFinancialEntries.id,
              type: teamFinancialEntries.type,
              title: teamFinancialEntries.title,
              amount: teamFinancialEntries.amount,
              currency: teamFinancialEntries.currency,
              dueOn: teamFinancialEntries.dueOn,
              referenceOn: FINANCE_REFERENCE_DATE,
              counterparty: teamFinancialEntries.counterparty,
              paid: sql<number>`coalesce((
                select sum(${teamFinancialEntryPayments.amount})
                from ${teamFinancialEntryPayments}
                where ${teamFinancialEntryPayments.entryId} = ${teamFinancialEntries.id}
              ), 0)`,
            })
            .from(teamFinancialEntries)
            .where(and(
              eq(teamFinancialEntries.teamId, ctx.teamId),
              inArray(teamFinancialEntries.status, ['pending', 'overdue']),
              sql`${FINANCE_REFERENCE_DATE} <= ${in30}`,
            ))
            .orderBy(sql`${FINANCE_REFERENCE_DATE} asc`)
            .limit(PER_KIND * 3)
        : Promise.resolve([]),
      canFinance
        ? db
            .select({ total: count() })
            .from(teamFinancialEntries)
            .where(and(
              eq(teamFinancialEntries.teamId, ctx.teamId),
              inArray(teamFinancialEntries.status, ['pending', 'overdue']),
              sql`${FINANCE_REFERENCE_DATE} <= ${in30}`,
            ))
        : Promise.resolve([{ total: 0 }]),
    ]);

  // Un solo lookup contacto -> chat para TODOS los kinds que no son chat, y
  // filtrado por el mismo scope: si el chat del contacto no es visible para este
  // usuario, el ítem se ve pero sin canal de respuesta.
  const contactIds = [
    ...new Set(
      [
        ...membershipRows.map((row) => row.contactId),
        ...dealRows.map((row) => row.contactId),
      ].filter((id): id is number => typeof id === 'number'),
    ),
  ];
  const contactChannel = new Map<number, { chatId: number; contactName: string }>();
  if (contactIds.length) {
    const rows = await db
      .select({ contactId: contacts.id, chatId: chats.id, name: contacts.name })
      .from(contacts)
      .innerJoin(chats, eq(contacts.chatId, chats.id))
      .where(and(scope, inArray(contacts.id, contactIds)));
    for (const row of rows) contactChannel.set(row.contactId, { chatId: row.chatId, contactName: row.name });
  }

  const canSend = can(ctx.permissions.messagesSend);
  const canTasksWrite = can(ctx.permissions.tasksWrite);
  const canDealsWrite = canDeals && can(ctx.permissions.dealsWrite);

  const items: CommandItem[] = [];

  for (const row of chatRows) {
    const unread = Number(row.unread ?? 0);
    const actions: CommandAction[] = [{ type: 'mark-chat-read', chatId: row.id }];
    items.push({
      id: `chat:${row.id}`,
      kind: 'chat',
      entityId: row.id,
      title: row.name,
      detail: row.preview?.trim() ? row.preview.slice(0, 140) : `${unread} sin leer`,
      href: `/dashboard/chat/${encodeURIComponent(row.remoteJid)}`,
      at: iso(row.at),
      urgent: unread >= 5,
      score: 60 + Math.min(unread, 10) * 2,
      actions,
      defaultActionType: 'mark-chat-read',
      reply: canSend ? { chatId: row.id, contactName: row.name } : null,
      suggestions: [],
      suggestionsState: 'idle',
    });
  }

  for (const row of taskRows) {
    const due = row.dueAt ? new Date(row.dueAt) : null;
    const overdue = !!due && due.getTime() < now.getTime();
    const actions: CommandAction[] = canTasksWrite
      ? [
          { type: 'complete-task', taskId: row.id },
          { type: 'snooze-task', taskId: row.id, days: 1 },
        ]
      : [];
    items.push({
      id: `task:${row.id}`,
      kind: 'task',
      entityId: row.id,
      title: row.title,
      detail: `${row.project} · ${row.column}`,
      href: '/plugins/tasks',
      at: iso(due),
      urgent: overdue,
      score: overdue ? 88 : due ? (due.getTime() - now.getTime() < DAY ? 70 : 40) : 20,
      actions,
      defaultActionType: canTasksWrite ? 'complete-task' : null,
      // Las tareas no tienen canal de mensajería, pero sí contexto operativo
      // para sugerir y guardar un próximo paso o una pregunta.
      reply: null,
      taskAi: {
        nextStep: row.aiNextStep,
        contextQuestion: row.aiContextQuestion,
        contextAnswer: row.aiContextAnswer,
      },
      suggestions: [],
      suggestionsState: 'idle',
    });
  }

  for (const row of membershipRows) {
    const channel = row.contactId ? contactChannel.get(row.contactId) : undefined;
    const overdue = row.paymentStatus === 'overdue';
    const daysLeft = row.endDate
      ? Math.round((new Date(`${row.endDate}T12:00:00`).getTime() - now.getTime()) / DAY)
      : null;
    items.push({
      id: `membership:${row.id}`,
      kind: 'membership',
      entityId: row.id,
      title: channel?.contactName ?? row.plan ?? row.number,
      detail: overdue
        ? `Pago vencido · ${row.plan || row.number}`
        : `Vence en ${daysLeft ?? '?'} días · ${row.plan || row.number}`,
      href: '/plugins/memberships',
      // Fecha sin hora: `end_date` es un día, no un instante.
      at: row.endDate ? `${row.endDate}T12:00:00.000Z` : null,
      dateOnly: true,
      urgent: overdue || (daysLeft != null && daysLeft <= 7),
      score: overdue ? 82 : daysLeft != null && daysLeft <= 7 ? 66 : 45,
      // Renovar propone correr la fecha un período según el tipo de
      // facturación. Es una propuesta, no una decisión: como toda acción del
      // lote, pasa por la revisión antes de aplicarse.
      actions: canMembershipsWrite && row.endDate
        ? [{
            type: 'renew-membership' as const,
            subscriptionId: row.id,
            newEndDate: nextPeriodEnd(row.endDate, row.billingType),
          }]
        : [],
      defaultActionType: canMembershipsWrite && row.endDate ? ('renew-membership' as const) : null,
      reply: canSend && channel ? { chatId: channel.chatId, contactName: channel.contactName } : null,
      suggestions: [],
      suggestionsState: 'idle',
      suggestionsReason: channel ? undefined : 'no-permission',
    });
  }

  for (const row of dealRows) {
    const channel = row.contactId ? contactChannel.get(row.contactId) : undefined;
    const stalledDays = Math.max(0, Math.round((now.getTime() - new Date(row.updatedAt).getTime()) / DAY));
    items.push({
      id: `deal:${row.id}`,
      kind: 'deal',
      entityId: row.id,
      title: row.title,
      detail: `${row.customerName ?? row.contactName ?? 'Sin cliente'} · ${stalledDays} días sin avanzar`,
      href: `/plugins/deals/${row.id}`,
      at: iso(row.updatedAt),
      urgent: stalledDays >= 30,
      score: Math.min(50 + Math.round(stalledDays / 2), 78),
      actions: canDealsWrite
        ? [{ type: 'move-deal-stage', dealId: row.id, stage: row.stage === 'qualified' ? 'proposal' : 'negotiation' }]
        : [],
      defaultActionType: canDealsWrite ? 'move-deal-stage' : null,
      reply: canSend && channel ? { chatId: channel.chatId, contactName: channel.contactName } : null,
      suggestions: [],
      suggestionsState: 'idle',
      suggestionsReason: channel ? undefined : 'no-permission',
    });
  }

  for (const row of eventRows) {
    const startsAt = row.startsAt ? new Date(row.startsAt) : null;
    const soon = !!startsAt && startsAt.getTime() - now.getTime() < DAY;
    items.push({
      id: `event:${row.id}`,
      kind: 'event',
      entityId: row.id,
      title: row.title,
      detail: row.contactName ?? row.customerName ?? 'Agenda',
      href: '/plugins/calendar',
      at: iso(startsAt),
      urgent: soon,
      score: soon ? 62 : 35,
      actions: [],
      defaultActionType: null,
      // `listEvents` no devuelve el contacto vinculado, así que el evento entra
      // como recordatorio: se abre, no se responde desde acá.
      reply: null,
      suggestions: [],
      suggestionsState: 'unavailable',
      suggestionsReason: 'no-channel',
    });
  }

  for (const row of financeRows) {
    // El pendiente real, no el total: un asiento con la mitad cobrada muestra la
    // mitad. Los montos jamás se suman entre monedas distintas.
    const pendiente = Math.max(0, row.amount - Number(row.paid ?? 0));
    if (pendiente <= 0) continue;
    const vence = row.referenceOn ?? row.dueOn ?? null;
    const dias = vence
      ? Math.round((new Date(`${vence}T12:00:00Z`).getTime() - now.getTime()) / DAY)
      : null;
    const vencido = dias != null && dias < 0;
    const cobrar = row.type === 'income';
    // Si el asiento no tiene vencimiento cargado, la fecha que se muestra es la
    // del movimiento. Decirlo evita que alguien lea "vencido" como un dato duro.
    const desdeOcurrido = !row.dueOn;
    items.push({
      id: `finance:${row.id}`,
      kind: 'finance',
      entityId: row.id,
      title: row.title,
      detail: `${cobrar ? 'Por cobrar' : 'Por pagar'} ${row.currency} ${pendiente}${row.counterparty ? ` · ${row.counterparty}` : ''}${
        vencido
          ? ` · ${desdeOcurrido ? 'sin cobrar hace' : 'vencido hace'} ${Math.abs(dias!)} días`
          : dias != null
            ? ` · ${desdeOcurrido ? 'del' : 'vence en'} ${desdeOcurrido ? vence : `${dias} días`}`
            : ''
      }`,
      href: '/plugins/finance',
      at: vence ? `${vence}T12:00:00.000Z` : null,
      dateOnly: true,
      urgent: vencido,
      score: vencido ? 88 : dias != null && dias <= 7 ? 64 : 40,
      // La acción propone saldar el pendiente completo en la fecha de hoy. El
      // monto es editable en la revisión: un pago parcial es lo normal.
      actions: canFinanceWrite
        ? [{
            type: 'settle-entry' as const,
            entryId: row.id,
            amount: pendiente,
            paidOn: today,
          }]
        : [],
      defaultActionType: canFinanceWrite ? ('settle-entry' as const) : null,
      reply: null,
      suggestions: [],
      suggestionsState: 'unavailable',
      suggestionsReason: 'no-channel',
    });
  }

  const counts = Object.fromEntries(COMMAND_ITEM_KINDS.map((kind) => [kind, 0])) as Record<CommandItemKind, number>;
  counts.chat = Number(chatTotal[0]?.total ?? 0);
  counts.task = Number(taskTotal[0]?.total ?? 0);
  counts.membership = Number(membershipTotal[0]?.total ?? 0);
  counts.deal = dealRows.length;
  counts.event = eventRows.length;
  counts.finance = Number(financeTotal[0]?.total ?? 0);

  const perKind = new Map<CommandItemKind, number>();
  const ordered = items
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.score - a.score || (a.at ?? '9999').localeCompare(b.at ?? '9999'))
    .filter((item) => {
      const used = perKind.get(item.kind) ?? 0;
      if (used >= PER_KIND) return false;
      perKind.set(item.kind, used + 1);
      return true;
    })
    .slice(0, limit);

  const ai = await getAIProviderForTeam(ctx.teamId);
  const user = userRow[0];

  return {
    generatedAt: now.toISOString(),
    teamId: ctx.teamId,
    items: ordered,
    counts,
    totals: {
      pending: COMMAND_ITEM_KINDS.reduce((sum, kind) => sum + counts[kind], 0),
      shown: ordered.length,
    },
    capabilities: {
      canSend,
      canTasksWrite,
      canDealsWrite,
      // Sólo un booleano: `ai_configs.apiKey` está en claro y no puede salir de
      // acá ni siquiera indirectamente.
      aiReady: !!ai && active.has('ai-chat') && ai.config.isActive !== false,
      // Misma firma que usa el inbox: si el equipo firma, el lote también.
      signatureName: user?.enableSignature && user.name ? user.name : null,
    },
  };
}
