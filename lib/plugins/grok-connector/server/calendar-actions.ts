import 'server-only';

import { z } from 'zod';
import { getEvent } from '@/lib/plugins/calendar/server/events';
import { cerrarReunion, crearTareaDesdeEvento } from '@/lib/plugins/calendar/server/reuniones';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Cierre de reuniones desde el conector.
 *
 * Una reunión sin resultado ni próxima acción es una reunión que se pierde.
 * Esta tool guarda lo que pasó (outcome), qué sigue (next_action) y, si se
 * pide, manda esa próxima acción a Tareas OS con la misma regla que la
 * pantalla (lib/plugins/calendar/server/reuniones.ts): vinculada al contacto
 * del evento si lo tiene, o al proyecto "Reuniones" si no.
 */

const isoDateProperty = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

export const calendarActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_calendar_close_meeting',
    description:
      'Cierra una reunión o llamada del Calendario y, opcionalmente, crea la tarea de seguimiento. '
      + 'action "close": guarda outcome (qué pasó), next_action (qué sigue) y notes, y marca el evento como completed (o canceled si no ocurrió); con create_task=true además crea la tarea en el mismo paso. '
      + 'action "create_task": sólo crea la tarea de seguimiento de un evento ya cerrado (o no), sin tocar su estado. '
      + 'La tarea toma por título next_action (o task_title), queda vinculada al contacto del evento si lo tiene —aparece en su ficha— o va al proyecto "Reuniones" de Tareas OS. '
      + 'Los eventos se buscan con whatspro_meeting_agenda o whatspro_list_records(resource="calendar-events"); para crear o reprogramar usá whatspro_manage_calendar_event.',
    inputSchema: {
      type: 'object',
      required: ['action', 'event_id'],
      properties: {
        action: { type: 'string', enum: ['close', 'create_task'] },
        event_id: { type: 'integer', minimum: 1 },
        outcome: { type: 'string', maxLength: 4000, description: 'Qué pasó en la reunión. Sólo para close.' },
        next_action: { type: 'string', maxLength: 500, description: 'Qué sigue. Sólo para close; es también el título por defecto de la tarea.' },
        notes: { type: 'string', maxLength: 4000, description: 'Notas del evento (reemplazan las anteriores). Sólo para close.' },
        status: { type: 'string', enum: ['completed', 'canceled'], description: 'Por defecto "completed". Sólo para close.' },
        create_task: { type: 'boolean', description: 'En close: crear además la tarea de seguimiento. Por defecto false.' },
        task_title: { type: 'string', minLength: 1, maxLength: 200, description: 'Título de la tarea. Si falta, se usa next_action; si tampoco hay, "Seguir: <título del evento>".' },
        task_notes: { type: 'string', maxLength: 20000, description: 'Notas de la tarea. Si faltan, se usa outcome (o las notas del evento) más la referencia a la reunión.' },
        task_due_date: { anyOf: [{ ...isoDateProperty }, { type: 'null' }], description: 'Vencimiento de la tarea (YYYY-MM-DD).' },
      },
      additionalProperties: false,
    },
  },
];

export const calendarReadTools: GrokActionTool[] = [];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const closeMeetingSchema = z.object({
  action: z.enum(['close', 'create_task']),
  event_id: z.number().int().positive(),
  outcome: z.string().max(4000).optional(),
  next_action: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
  status: z.enum(['completed', 'canceled']).optional(),
  create_task: z.boolean().optional(),
  task_title: z.string().trim().min(1).max(200).optional(),
  task_notes: z.string().max(20000).optional(),
  task_due_date: isoDate.nullable().optional(),
});

async function cerrarReunionTool(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'calendarWrite', 'calendar');
  const data = parse(closeMeetingSchema, input);

  const existente = await getEvent(context.teamId, data.event_id);
  if (!existente) throw new Error('El evento no existe en este equipo.');

  let event = existente;
  let closed = false;
  if (data.action === 'close') {
    if (existente.status === 'completed' && data.status !== 'canceled' && data.outcome === undefined && data.next_action === undefined && data.notes === undefined) {
      throw new Error('La reunión ya estaba cerrada y no mandaste nada nuevo. Para agregar la tarea de seguimiento usá action="create_task".');
    }
    event = await cerrarReunion(context.teamId, context.userId, data.event_id, {
      outcome: data.outcome,
      nextAction: data.next_action,
      notes: data.notes,
      status: data.status,
    });
    closed = true;
    await audit(context, event.status === 'canceled' ? 'GROK_CALENDAR_MEETING_CANCELED' : 'GROK_CALENDAR_MEETING_CLOSED', event.id);
  }

  const quiereTarea = data.action === 'create_task' || data.create_task === true;
  let task: { taskId: number; projectId: number | null } | null = null;
  if (quiereTarea) {
    if (data.action === 'create_task' && !data.task_title && !event.nextAction.trim()) {
      throw new Error('El evento no tiene próxima acción cargada: mandá task_title (o cerralo antes con next_action).');
    }
    task = await crearTareaDesdeEvento(context.teamId, context.userId, data.event_id, {
      title: data.task_title,
      notes: data.task_notes,
      dueDate: data.task_due_date,
    });
    await audit(context, 'GROK_CALENDAR_FOLLOWUP_TASK_CREATED', task.taskId);
  }

  return {
    success: true,
    action: data.action,
    closed,
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      starts_at: event.startsAt,
      contact_id: event.contactId,
      outcome: event.outcome,
      next_action: event.nextAction,
    },
    task: task
      ? {
          id: task.taskId,
          project_id: task.projectId,
          linked_to: event.contactId ? `contact:${event.contactId}` : 'project:Reuniones',
        }
      : null,
    ...(closed && !quiereTarea && event.nextAction.trim()
      ? { note: 'Quedó una próxima acción sin tarea: si querés que no se pierda, repetí con action="create_task".' }
      : {}),
  };
}

export async function executeCalendarTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_calendar_close_meeting') return cerrarReunionTool(input, context);
  throw new Error(`Unknown calendar tool: ${name}`);
}
