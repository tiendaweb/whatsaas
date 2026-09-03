import { createDeal, listDeals } from '@/lib/deals/service';
import { customerForContact } from '@/lib/customers/service';
import { fromCents, logBotAction, resolveActorUserId, resolveChatContact, toCents, toNumber } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

/** Oportunidades (pipeline de ventas). */
export const dealsTools: BuiltinToolDefinition[] = [
  {
    name: 'create_opportunity',
    pluginId: 'deals',
    label: 'Crear oportunidad',
    summary: 'Abre una oportunidad en el pipeline con valor estimado cuando hay una intención de compra concreta.',
    risk: 'write',
    description:
      'Crea una oportunidad de venta en el pipeline del equipo cuando la persona muestra una intención de compra concreta (pidió presupuesto, quiere contratar, consulta por un proyecto). Incluí título descriptivo y valor estimado si lo hay. Antes verificá con get_open_opportunities que no exista una abierta parecida.',
    parameters: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Qué quiere comprar/contratar (ej. "Sitio web institucional")' },
        value: { type: 'number', description: 'Valor estimado en unidades de la moneda (opcional)' },
        currency: { type: 'string', description: 'Código ISO de 3 letras. Por defecto USD.' },
        notes: { type: 'string', description: 'Contexto: necesidad, plazos, presupuesto mencionado' },
      },
    },
    execute: async (args, context) => {
      const title = typeof args.title === 'string' ? args.title.trim().slice(0, 200) : '';
      if (!title) return fail('title es obligatorio');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const [actorId, customer] = await Promise.all([resolveActorUserId(context.teamId, bundle.contact), customerForContact(context.teamId, bundle.contact.id)]);
      const value = toNumber(args.value);
      const deal = await createDeal(
        context.teamId,
        {
          title,
          contactId: bundle.contact.id,
          customerId: customer?.id ?? null,
          stage: 'qualified',
          value: value !== null && value > 0 ? toCents(value) : 0,
          currency: typeof args.currency === 'string' && /^[A-Za-z]{3}$/.test(args.currency) ? args.currency.toUpperCase() : 'USD',
          ownerId: bundle.contact.assignedUserId ?? actorId,
          source: 'whatsapp-ai',
          notes: typeof args.notes === 'string' ? args.notes.slice(0, 2000) : '',
        },
        actorId,
      );
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ deal_id: deal.id, title: deal.title, stage: deal.stage, value: fromCents(deal.value), currency: deal.currency });
    },
  },
  {
    name: 'get_open_opportunities',
    pluginId: 'deals',
    label: 'Ver oportunidades abiertas',
    summary: 'Oportunidades abiertas de la persona: etapa, valor y cierre esperado.',
    risk: 'read',
    description: 'Lista las oportunidades de venta abiertas de la persona con etapa, valor y fecha de cierre esperada. Usala para retomar una negociación en curso o evitar crear duplicados.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const deals = await listDeals(context.teamId, { contactId: bundle.contact.id, open: true });
      return ok({ deals: deals.slice(0, 10).map((d) => ({ deal_id: d.id, title: d.title, stage: d.stage, value: fromCents(d.value), currency: d.currency, probability: d.probability, expected_close_date: d.expectedCloseDate ? new Date(d.expectedCloseDate).toISOString().slice(0, 10) : null, owner: d.ownerName, notes: (d.notes ?? '').slice(0, 300) })) });
    },
  },
];
