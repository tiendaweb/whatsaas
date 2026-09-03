import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembershipPlans, teamMembershipSubscriptions } from '@/lib/db/schema';
import { getContactCommercialSnapshot } from '@/lib/contacts/graph';
import { convertContactToCustomer } from '@/lib/customers/service';
import { fromCents, logBotAction, resolveActorUserId, resolveChatContact } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

const MONTHS_BY_BILLING: Record<string, number | null> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, biannual: 6, annual: 12, yearly: 12, one_time: null, lifetime: null,
};

function addMonths(day: string, months: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Membresías: planes, estado y alta de suscripción. */
export const membershipsTools: BuiltinToolDefinition[] = [
  {
    name: 'list_membership_plans',
    pluginId: 'memberships',
    label: 'Listar planes de membresía',
    summary: 'Planes activos y públicos con precio, frecuencia y beneficios.',
    risk: 'read',
    description: 'Lista los planes de membresía/suscripción que el negocio ofrece (nombre, precio, frecuencia de cobro, beneficios). Usala cuando el cliente pregunte por planes, precios de suscripción o quiera cambiar de plan.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const plans = await db.query.teamMembershipPlans.findMany({
        where: and(eq(teamMembershipPlans.teamId, context.teamId), eq(teamMembershipPlans.status, 'active'), eq(teamMembershipPlans.visibility, 'public')),
        orderBy: [asc(teamMembershipPlans.position), asc(teamMembershipPlans.name)],
        limit: 30,
      });
      return ok({
        plans: plans.map((p) => ({
          plan_id: p.id,
          name: p.name,
          description: p.description,
          price: fromCents(p.price),
          setup_fee: fromCents(p.setupFee),
          currency: p.currency,
          billing: p.billingLabel || p.billingType,
          features: (p.features as any[]).map((f) => (typeof f === 'string' ? f : f?.label ?? f?.name ?? '')).filter(Boolean).slice(0, 12),
        })),
      });
    },
  },
  {
    name: 'get_membership_status',
    pluginId: 'memberships',
    label: 'Ver estado de membresía',
    summary: 'Membresías activas, vencidas o impagas de la persona, con fecha de renovación.',
    risk: 'read',
    description: 'Devuelve las membresías de la persona: plan, estado, estado de pago, fecha de vencimiento y días restantes. Usala cuando pregunte "hasta cuándo tengo el plan", "está pago mi mes" o para recordarle una renovación.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const snapshot = await getContactCommercialSnapshot(context.teamId, { chatId: context.chatId }, { deals: false, money: false, agenda: false });
      const subs = snapshot?.subscriptions;
      if (!subs) return ok({ active: [], note: 'La persona no tiene membresías registradas.' });
      const map = (s: (typeof subs.active)[number]) => ({ subscription_id: s.subscriptionId, plan: s.planName, price: fromCents(s.price), currency: s.currency, billing: s.billingType, status: s.status, payment_status: s.paymentStatus, start_date: s.startDate, end_date: s.endDate, days_left: s.daysLeft });
      return ok({ active: subs.active.map(map), unpaid: subs.unpaid.map(map), last_expired: subs.lastExpired ? map(subs.lastExpired) : null, next_renewal: subs.nextRenewal, last_payment: subs.lastPayment });
    },
  },
  {
    name: 'register_membership',
    pluginId: 'memberships',
    label: 'Dar de alta una membresía',
    summary: 'Suscribe a la persona a un plan (queda con pago pendiente hasta que un humano lo confirme).',
    risk: 'write',
    description:
      'Suscribe a la persona a un plan de membresía. Primero mostrá los planes con list_membership_plans y confirmá cuál eligió. La suscripción se crea con pago PENDIENTE: el equipo la confirma cuando verifica el pago. Si la persona no era cliente, se la registra automáticamente. No la uses para renovar una activa: en ese caso avisá al equipo.',
    parameters: {
      type: 'object',
      required: ['plan_id'],
      properties: {
        plan_id: { type: 'integer', description: 'id del plan elegido (de list_membership_plans)' },
        start_date: { type: 'string', description: 'Fecha de inicio YYYY-MM-DD. Por defecto hoy.' },
        notes: { type: 'string', description: 'Observaciones (medio de pago prometido, aclaraciones)' },
      },
    },
    execute: async (args, context) => {
      const planId = Number(args.plan_id);
      if (!Number.isInteger(planId)) return fail('plan_id inválido');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const plan = await db.query.teamMembershipPlans.findFirst({ where: and(eq(teamMembershipPlans.id, planId), eq(teamMembershipPlans.teamId, context.teamId), eq(teamMembershipPlans.status, 'active')) });
      if (!plan) return fail('Plan no encontrado o inactivo');

      const startDate = typeof args.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.start_date) ? args.start_date : new Date().toISOString().slice(0, 10);
      const months = MONTHS_BY_BILLING[plan.billingType] ?? 1;
      const endDate = months ? addMonths(startDate, months) : null;
      const externalId = `chat-${context.chatId}-plan-${plan.id}-${startDate}`;

      const existing = await db.query.teamMembershipSubscriptions.findFirst({ where: and(eq(teamMembershipSubscriptions.teamId, context.teamId), eq(teamMembershipSubscriptions.externalSource, 'ai-chat'), eq(teamMembershipSubscriptions.externalId, externalId)) });
      if (existing) return ok({ subscription_id: existing.id, number: existing.subscriptionNumber, already_created: true, plan: plan.name, end_date: existing.endDate });

      const actorId = await resolveActorUserId(context.teamId, bundle.contact);
      const { customer } = await convertContactToCustomer(context.teamId, bundle.contact.id, {}, actorId);
      const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(teamMembershipSubscriptions).where(eq(teamMembershipSubscriptions.teamId, context.teamId));
      const subscriptionNumber = `M-${String((Number(total) || 0) + 1).padStart(4, '0')}`;

      const [sub] = await db
        .insert(teamMembershipSubscriptions)
        .values({
          teamId: context.teamId,
          subscriptionNumber,
          planId: plan.id,
          companyId: plan.companyId,
          customerId: customer.id,
          contactId: bundle.contact.id,
          externalSource: 'ai-chat',
          externalId,
          planNameSnapshot: plan.name,
          price: plan.price,
          currency: plan.currency,
          billingType: plan.billingType,
          status: 'active',
          paymentStatus: 'pending',
          startDate,
          endDate,
          notes: typeof args.notes === 'string' ? args.notes.slice(0, 2000) : 'Alta solicitada por WhatsApp (agente IA)',
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ subscription_id: sub.id, number: subscriptionNumber, plan: plan.name, price: fromCents(plan.price), currency: plan.currency, start_date: startDate, end_date: endDate, payment_status: 'pending' });
    },
  },
];
