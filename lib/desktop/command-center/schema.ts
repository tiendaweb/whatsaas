import { z } from 'zod';
import { BATCH_DEAL_STAGES } from './types';

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send-message'),
    chatId: z.number().int().positive(),
    text: z.string().min(1).max(4000),
    source: z.enum(['ai', 'template', 'custom']),
    suggestionId: z.string().max(120).nullish(),
  }),
  z.object({ type: z.literal('mark-chat-read'), chatId: z.number().int().positive() }),
  z.object({ type: z.literal('complete-task'), taskId: z.number().int().positive() }),
  z.object({
    type: z.literal('set-task-ai-detail'),
    taskId: z.number().int().positive(),
    field: z.enum(['next-step', 'context-question', 'context-answer']),
    text: z.string().trim().min(1).max(20000),
    source: z.enum(['ai', 'template', 'custom']),
    suggestionId: z.string().max(120).nullish(),
  }),
  z.object({
    type: z.literal('snooze-task'),
    taskId: z.number().int().positive(),
    // Acotado: `1e15` o `NaN` terminan en un `Invalid Date` que revienta el
    // UPDATE con un error crudo de driver.
    days: z.number().int().min(1).max(90),
  }),
  z.object({
    type: z.literal('move-deal-stage'),
    dealId: z.number().int().positive(),
    // Sólo etapas abiertas: `closed_won` emite venta y exige `salesWrite`.
    stage: z.enum(BATCH_DEAL_STAGES as unknown as [string, ...string[]]),
  }),
  z.object({
    type: z.literal('set-crm-stage'),
    chatId: z.number().int().positive(),
    // `null` saca al contacto del embudo, que es una operación legítima.
    funnelStageId: z.number().int().positive().nullable(),
  }),
  z.object({
    type: z.literal('change-contact-tags'),
    chatId: z.number().int().positive(),
    add: z.array(z.number().int().positive()).max(30).optional(),
    remove: z.array(z.number().int().positive()).max(30).optional(),
  }),
  z.object({
    type: z.literal('assign-contact'),
    chatId: z.number().int().positive(),
    assignedUserId: z.number().int().positive().nullish(),
    assignedDepartmentId: z.number().int().positive().nullish(),
  }),
  z.object({
    type: z.literal('add-internal-note'),
    chatId: z.number().int().positive(),
    text: z.string().trim().min(1).max(5000),
    source: z.enum(['ai', 'template', 'custom']),
  }),
  z.object({
    type: z.literal('create-task'),
    chatId: z.number().int().positive(),
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(10000).optional(),
    dueDate: z.string().date().nullish(),
  }),
  z.object({
    type: z.literal('renew-membership'),
    subscriptionId: z.number().int().positive(),
    newEndDate: z.string().date(),
    paymentStatus: z.enum(['pending', 'paid', 'overdue', 'refunded']).optional(),
    recordPayment: z.boolean().optional(),
    // `min(0)` y no `positive()`: una renovación bonificada vale 0, y es un caso
    // real. Lo que no se acepta es un monto negativo.
    amount: z.number().int().min(0).optional(),
    accountId: z.number().int().positive().nullish(),
  }),
  z.object({
    type: z.literal('settle-entry'),
    entryId: z.number().int().positive(),
    amount: z.number().int().positive(),
    paidOn: z.string().date(),
    accountId: z.number().int().positive().nullish(),
    method: z.string().max(80).nullish(),
    notes: z.string().max(2000).nullish(),
  }),
]);

/**
 * Las reglas de "al menos uno de estos campos" viven acá y no en el miembro de
 * la unión: `z.discriminatedUnion` sólo acepta `ZodObject`, y un `.refine()`
 * devuelve `ZodEffects`. Ponerlas adentro rompe la unión entera.
 */
const plannedSchema = z
  .object({
    itemId: z.string().regex(/^(chat|task|membership|deal|event|finance):\d+$/),
    action: actionSchema,
  })
  .superRefine((planned, ctx) => {
    const { action } = planned;
    if (action.type === 'change-contact-tags' && (action.add?.length ?? 0) + (action.remove?.length ?? 0) === 0) {
      ctx.addIssue({ code: 'custom', path: ['action'], message: 'Mandá al menos una etiqueta en add o en remove.' });
    }
    if (
      action.type === 'assign-contact'
      && action.assignedUserId === undefined
      && action.assignedDepartmentId === undefined
    ) {
      ctx.addIssue({ code: 'custom', path: ['action'], message: 'Mandá assignedUserId o assignedDepartmentId (null desasigna).' });
    }
  });

/** El `teamId` viaja explícito y el servidor compara: `getUserPermissionContext`
 *  resuelve el equipo con un `findFirst` por `userId`, y un usuario en dos
 *  equipos podría mandar el mensaje desde el WhatsApp de la otra empresa. */
export const validateBodySchema = z.object({
  teamId: z.number().int().positive(),
  batchId: z.string().min(8).max(64),
  actions: z.array(plannedSchema).min(1).max(25),
});

export const executeBodySchema = validateBodySchema.extend({
  /** No es un booleano opcional a propósito: la confirmación tiene que ser
   *  explícita para que perder un campo nunca signifique "ejecutá". */
  confirm: z.literal('EJECUTAR'),
  actions: z
    .array(plannedSchema)
    .min(1)
    .max(25)
    .refine(
      (actions) => actions.filter((item) => item.action.type === 'send-message').length <= 1,
      'Los envíos van de a uno: así el usuario puede detener el lote a mitad de camino.',
    ),
});
