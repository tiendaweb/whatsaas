import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { CANALES } from './tipos';
import { listarDestinatarios, listarGrupos, listarSectores, notify } from './service';

/**
 * Avisar por MCP.
 *
 * Es la forma de que un conector diga "esto hay que hacerlo" y le llegue a la
 * persona por donde ella eligió (app, push o WhatsApp), o al grupo del equipo.
 * No envía mensajes a clientes: para eso está la cola del Command Center.
 *
 * 🚨 `inputSchema` es JSON Schema puro (nada de zod adentro).
 */
export const notifyReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_notify_targets',
    description:
      'Lista a quién se le puede avisar: los miembros del equipo (con su user_id, su sector, si tienen WhatsApp configurado y cuántos dispositivos reciben push), los sectores del equipo con su department_id y los grupos de WhatsApp con su jid. Usalo antes de whatspro_notify para no adivinar destinatarios.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export const notifyActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_notify',
    description:
      'Manda un aviso interno al equipo: aparece en la campana de WhatsPro y, si la persona lo configuró, le llega por push del navegador y/o por WhatsApp a su número. ' +
      'user_id = a una persona; department_id = sólo a quienes trabajan en ese sector; sin ninguno de los dos = a todo el equipo. group_jid + canal "group" = al grupo de WhatsApp. ' +
      'Con schedule_for queda programado y sale a esa hora. dedupe_key evita mandar dos veces lo mismo. ' +
      'NO es para escribirle a un cliente: eso va por la cola del Command Center (whatspro_sales_queue_propose).',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 180, description: 'Titular corto: es lo que se lee en la notificación.' },
        body: { type: 'string', maxLength: 4000, description: 'El detalle, en 1-3 líneas.' },
        user_id: { type: ['integer', 'null'], minimum: 1, description: 'Destinatario. Omitir o null = el sector indicado, o todo el equipo si no hay sector.' },
        department_id: { type: ['integer', 'null'], minimum: 1, description: 'Sectoriza el aviso: sólo le llega a la gente de ese sector (departamento). Los ids salen de whatspro_notify_targets.' },
        channels: { type: 'array', items: { type: 'string', enum: [...CANALES] }, maxItems: 4, description: 'inapp (default), push, whatsapp, group. Cada persona puede tener sus propias reglas por tipo.' },
        group_jid: { type: ['string', 'null'], maxLength: 64, description: 'Grupo de WhatsApp (…@g.us) para el canal "group". Si falta, se usa el grupo configurado del equipo.' },
        url: { type: ['string', 'null'], maxLength: 400, description: 'A dónde lleva el aviso al tocarlo (ruta de WhatsPro).' },
        kind: { type: 'string', maxLength: 50, description: 'Tipo de aviso (calendar.reminder, task.assigned, queue.review, manual…). Default manual.' },
        schedule_for: { type: ['string', 'null'], maxLength: 40, description: 'ISO 8601: cuándo sale. Sin esto, sale ya.' },
        dedupe_key: { type: ['string', 'null'], maxLength: 160, description: 'Clave para no repetir el mismo aviso.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

const schema = z.object({
  title: z.string().min(1).max(180),
  body: z.string().max(4000).optional(),
  user_id: z.number().int().positive().nullable().optional(),
  department_id: z.number().int().positive().nullable().optional(),
  channels: z.array(z.enum(CANALES)).max(4).optional(),
  group_jid: z.string().max(64).nullable().optional(),
  url: z.string().max(400).nullable().optional(),
  kind: z.string().max(50).optional(),
  schedule_for: z.string().max(40).nullable().optional(),
  dedupe_key: z.string().max(160).nullable().optional(),
  dry_run: z.boolean().optional(),
});

export async function executeNotifyTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_notify_targets') {
    const [destinatarios, sectores, grupos] = await Promise.all([listarDestinatarios(context.teamId), listarSectores(context.teamId), listarGrupos(context.teamId)]);
    return {
      destinatarios,
      sectores,
      grupos,
      nota: 'Para avisarle a todo el equipo omití user_id y department_id. Para un sector usá department_id. Para un grupo, channels:["group"] con su jid.',
    };
  }
  if (name !== 'whatspro_notify') throw new Error(`notificaciones: tool desconocida ${name}`);
  await assertPermission(context, 'messagesSend');
  const data = parse(schema, input);
  const cuando = data.schedule_for ? new Date(data.schedule_for) : null;
  if (data.schedule_for && (!cuando || !Number.isFinite(cuando.getTime()))) throw new Error('schedule_for inválido (ISO 8601).');
  if (data.dry_run) return { dryRun: true, ...data };
  const r = await notify({
    teamId: context.teamId,
    userId: data.user_id === undefined ? null : data.user_id,
    departmentId: data.department_id ?? null,
    kind: data.kind ?? 'manual',
    title: data.title,
    body: data.body ?? '',
    url: data.url ?? null,
    channels: data.channels ?? ['inapp'],
    groupJid: data.group_jid ?? null,
    scheduledFor: cuando,
    source: 'connector',
    createdBy: context.userId,
    dedupeKey: data.dedupe_key ?? null,
  });
  return { ...r, nota: cuando ? 'Programado: sale a la hora indicada.' : 'Enviado por los canales configurados de cada persona.' };
}
