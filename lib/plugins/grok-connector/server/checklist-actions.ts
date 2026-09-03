import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems, type TaskChecklistItem } from '@/lib/db/schema';
import { patchTaskItem } from '@/lib/plugins/tasks/server/task-os';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Operaciones sobre UN ítem del checklist.
 *
 * `whatspro_manage_task` ya hace actualización parcial por campo (no borra lo
 * que no mandás), pero `checklist` es un array: para marcar una casilla hay que
 * reenviar el array entero. En tareas con checklists largos eso significa
 * mandar miles de caracteres para cambiar un booleano, y cualquier ítem que se
 * omita al reconstruirlo desaparece.
 *
 * Acá el servidor lee el array actual, aplica UN cambio y lo vuelve a escribir.
 * El modelo nunca tiene que reconstruirlo.
 */

export const checklistActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_task_checklist_item',
    description:
      'Marca, desmarca, agrega, renombra o elimina UN ítem del checklist de una tarea, sin tocar el resto. '
      + 'Usá esto en lugar de whatspro_manage_task cuando sólo querés mover una casilla: no hace falta reenviar el checklist completo '
      + 'y no hay riesgo de perder ítems al reconstruirlo. Para saber los índices y los ids, leé la tarea con whatspro_get_record.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'action'],
      properties: {
        task_id: { type: 'integer', minimum: 1 },
        action: {
          type: 'string',
          enum: ['check', 'uncheck', 'toggle', 'add', 'rename', 'remove'],
          description: 'check/uncheck/toggle cambian el estado; add agrega al final; rename cambia el texto; remove lo saca.',
        },
        item_id: { type: 'string', maxLength: 100, description: 'Id del ítem. Para todo menos "add" hace falta esto o item_index.' },
        item_index: { type: 'integer', minimum: 0, description: 'Posición del ítem (0 = el primero). Alternativa a item_id.' },
        text: { type: 'string', minLength: 1, maxLength: 500, description: 'Obligatorio para "add" y "rename".' },
        completed: { type: 'boolean', description: 'Sólo para "add": si el ítem nace ya marcado. Por defecto false.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_bulk_status',
    description:
      'Cambia el estado de varias tareas de una sola llamada (por ejemplo, cerrar las tres tarjetas de un proyecto). '
      + 'Sólo toca el estado: no reenvía ni pisa notas, checklist ni etiquetas. Devuelve el resultado tarea por tarea. '
      + 'Con dry_run: true muestra qué haría sin escribir.',
    inputSchema: {
      type: 'object',
      required: ['task_ids', 'status'],
      properties: {
        task_ids: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'integer', minimum: 1 } },
        status: { type: 'string', enum: ['open', 'in_progress', 'done'] },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

const checklistSchema = z.object({
  task_id: z.number().int().positive(),
  action: z.enum(['check', 'uncheck', 'toggle', 'add', 'rename', 'remove']),
  item_id: z.string().max(100).optional(),
  item_index: z.number().int().min(0).optional(),
  text: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'add') {
    if (!data.text) ctx.addIssue({ code: 'custom', message: 'text es obligatorio para "add"', path: ['text'] });
    return;
  }
  if (data.item_id === undefined && data.item_index === undefined) {
    ctx.addIssue({ code: 'custom', message: 'hace falta item_id o item_index', path: ['item_id'] });
  }
  if (data.action === 'rename' && !data.text) {
    ctx.addIssue({ code: 'custom', message: 'text es obligatorio para "rename"', path: ['text'] });
  }
});

const bulkSchema = z.object({
  task_ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(['open', 'in_progress', 'done']),
  dry_run: z.boolean().optional(),
});

async function operarChecklist(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(checklistSchema, input);

  const tarea = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, data.task_id), eq(teamTaskItems.teamId, context.teamId)),
    columns: { id: true, title: true, checklist: true },
  });
  if (!tarea) throw new Error('La tarea no existe en este equipo.');

  const actual = [...((tarea.checklist as TaskChecklistItem[] | null) ?? [])];

  if (data.action === 'add') {
    const nuevo: TaskChecklistItem = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: data.text!,
      completed: data.completed ?? false,
    };
    actual.push(nuevo);
    return guardar(context, data.task_id, tarea.title, actual, `agregado "${nuevo.text}"`);
  }

  const indice = data.item_id !== undefined
    ? actual.findIndex((item) => item.id === data.item_id)
    : data.item_index!;

  if (indice < 0 || indice >= actual.length) {
    throw new Error(
      `El ítem no existe. El checklist tiene ${actual.length} ítem(s): `
      + actual.map((item, i) => `[${i}] ${item.id} — ${item.text}`).join(' | '),
    );
  }

  const item = actual[indice];
  if (data.action === 'remove') {
    actual.splice(indice, 1);
    return guardar(context, data.task_id, tarea.title, actual, `eliminado "${item.text}"`);
  }
  if (data.action === 'rename') {
    actual[indice] = { ...item, text: data.text! };
    return guardar(context, data.task_id, tarea.title, actual, `renombrado a "${data.text}"`);
  }

  const completed = data.action === 'toggle' ? !item.completed : data.action === 'check';
  actual[indice] = { ...item, completed };
  return guardar(
    context,
    data.task_id,
    tarea.title,
    actual,
    `"${item.text}" ${completed ? 'marcado' : 'desmarcado'}`,
  );
}

async function guardar(
  context: GrokActionContext,
  taskId: number,
  titulo: string,
  checklist: TaskChecklistItem[],
  detalle: string,
) {
  const resultado = await patchTaskItem({ teamId: context.teamId, taskId, patch: { checklist } });
  if ('error' in resultado) throw new Error(`No se pudo actualizar el checklist: ${resultado.error}`);

  await audit(context, 'GROK_TASK_CHECKLIST_ITEM', taskId);
  const hechos = checklist.filter((item) => item.completed).length;
  return {
    success: true,
    task_id: taskId,
    task_title: titulo,
    detalle,
    progreso: `${hechos}/${checklist.length}`,
    checklist,
  };
}

async function cambiarEstadoEnLote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(bulkSchema, input);

  const resultados: Array<{ task_id: number; ok: boolean; title?: string; error?: string }> = [];

  // Una sola consulta para saber cuáles existen y en qué estado están. Antes
  // era un SELECT por tarea: 50 tareas eran 50 viajes a la base sólo para el
  // simulacro, y el tope de la tool son 200.
  const existentes = await db
    .select({ id: teamTaskItems.id, title: teamTaskItems.title, status: teamTaskItems.status })
    .from(teamTaskItems)
    .where(and(eq(teamTaskItems.teamId, context.teamId), inArray(teamTaskItems.id, data.task_ids)));
  const porId = new Map(existentes.map((tarea) => [tarea.id, tarea]));

  for (const taskId of data.task_ids) {
    if (!porId.has(taskId)) resultados.push({ task_id: taskId, ok: false, error: 'no existe en este equipo' });
  }

  if (data.dry_run) {
    for (const taskId of data.task_ids) {
      const tarea = porId.get(taskId);
      if (tarea) resultados.push({ task_id: taskId, ok: true, title: `${tarea.title} (${tarea.status} → ${data.status})` });
    }
  } else {
    // La escritura sigue pasando por `patchTaskItem` una por una a propósito:
    // ahí viven los efectos que un UPDATE masivo se saltearía (completedAt, el
    // espejo de la tarea en el chat y el aviso por Pusher). Lo que cambia es
    // que ya no se espera a que termine una para empezar la siguiente.
    const aplicadas = await Promise.all(existentes.map(async (tarea) => {
      const resultado = await patchTaskItem({ teamId: context.teamId, taskId: tarea.id, patch: { status: data.status } });
      return 'error' in resultado
        ? { task_id: tarea.id, ok: false, error: resultado.error }
        : { task_id: tarea.id, ok: true, title: tarea.title };
    }));
    resultados.push(...aplicadas);
  }

  // El orden del pedido se conserva: un lote que devuelve las filas barajadas
  // obliga a quien lo llamó a reordenarlas para leer el resultado.
  resultados.sort((a, b) => data.task_ids.indexOf(a.task_id) - data.task_ids.indexOf(b.task_id));

  if (!data.dry_run) await audit(context, 'GROK_TASKS_BULK_STATUS', data.task_ids.length);

  return {
    success: resultados.every((fila) => fila.ok),
    dry_run: data.dry_run ?? false,
    status: data.status,
    aplicadas: resultados.filter((fila) => fila.ok).length,
    fallidas: resultados.filter((fila) => !fila.ok).length,
    data: resultados,
  };
}

export async function executeChecklistTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_task_checklist_item') return operarChecklist(input, context);
  if (name === 'whatspro_tasks_bulk_status') return cambiarEstadoEnLote(input, context);
  throw new Error(`Unknown checklist tool: ${name}`);
}
