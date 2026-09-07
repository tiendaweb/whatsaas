import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { loadProductionOs } from '@/lib/plugins/tasks/server/production-os';
import { listProductionWorkQueue } from '@/lib/plugins/tasks/server/production-work-queue';
import { cadenaDeTrabajo, FAMILIAS_LISTA, WORK_KINDS, WORK_KIND_META } from '@/lib/plugins/tasks/shared/produccion';

/**
 * Producción OS por MCP (`whatspro_production_*`).
 *
 * El Command Center Comercial decide QUÉ hay que hacerle a cada cliente; esto
 * es lo otro: hacerlo. Un conector pide la cola, agarra un pedido, lo produce
 * con las tools de AAPP SPACE que el ítem le nombra y lo cierra con el enlace.
 *
 * Los dos frenos que no se aflojan: no se entrega sin `delivery_url` (el enlace
 * ES la entrega) y no se saltean estados (`WORK_STATUS_TRANSITIONS`), para que
 * nadie marque terminado algo que nunca nadie tomó.
 *
 * 🚨 `inputSchema` es JSON Schema puro: un `z.object` adentro hace desaparecer
 * la tool en silencio. Verificar con
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
 */

const TIPOS_AYUDA = WORK_KINDS.map((kind) => `${kind} (${WORK_KIND_META[kind].label})`).join(', ');

export const productionReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_production_work_queue',
    description:
      'La cola de PRODUCCIÓN: qué hay para hacer y con qué tool se hace cada cosa. Devuelve los pedidos que esperan a producción '
      + '(pedido), los tomados sin arrancar (aceptado), los cambios pedidos sobre algo ya entregado (cambios) y lo que está en curso '
      + 'asignado a vos, ordenados demos → cambios → producción y por vencimiento. Cada ítem trae el brief, el prompt, el checklist, '
      + 'el cliente, y la CADENA EXACTA de tools y pasos para ese tipo de trabajo: sitio de una página = gobiz_sites_create, tienda = '
      + 'gobiz_stores_create, sitio profesional = gobiz_prosites_create, HTML propio = gobiz_html_create, desarrollo y tienda custom = '
      + 'plan en Tareas OS. Los productos de AAPP SPACE no se convierten entre sí: elegir mal obliga a rehacerlo. Empezá SIEMPRE por acá '
      + 'antes de producir nada, y cerrá cada pedido con whatspro_production_update. No incluye lo que espera al cliente: ahí no hay nada que puedas hacer.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Cuántos pedidos traer (por defecto 20).' },
        family: { type: 'string', enum: [...FAMILIAS_LISTA], description: 'demo = pre-venta, rápido y en volumen; produccion = lo vendido; cambio = retoques sobre lo entregado.' },
        work_kinds: { type: 'array', maxItems: 12, items: { type: 'string', enum: [...WORK_KINDS] }, description: `Sólo estos tipos: ${TIPOS_AYUDA}.` },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_production_get',
    description:
      'Un pedido de producción completo: brief, prompt para generar el trabajo, checklist con lo que falta, cliente y chat, enlace de '
      + 'entrega si ya lo tiene, motivo por el que está trabado, responsable y quién lo pidió, más la cadena de tools y los pasos de su '
      + 'tipo. Es el primer paso de cualquier pedido que vayas a hacer.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: { task_id: { type: 'integer', minimum: 1, description: 'Id del pedido (viene en whatspro_production_work_queue).' } },
      additionalProperties: false,
    },
  },
];

/**
 * Producción OS ya expone `whatspro_production_create` y
 * `whatspro_production_update` desde `lib/plugins/sales-ops/tools/tareas-tools.ts`
 * (el chat es el que pide el trabajo, así que nacieron ahí). Este módulo NO las
 * duplica: aporta lo que faltaba, que es la cola con la receta de cada tipo.
 */
export const productionActionTools: GrokActionTool[] = [];

const queueSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  family: z.enum(['demo', 'produccion', 'cambio']).optional(),
  work_kinds: z.array(z.enum(WORK_KINDS)).max(12).optional(),
});

const getSchema = z.object({ task_id: z.number().int().positive() });



export async function executeProductionTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_production_work_queue') {
    await assertPermission(context, 'tasksRead', 'tasks');
    const data = parse(queueSchema, input);
    return listProductionWorkQueue(context.teamId, { limit: data.limit, family: data.family, workKinds: data.work_kinds, forUserId: context.userId });
  }

  if (name === 'whatspro_production_get') {
    await assertPermission(context, 'tasksRead', 'tasks');
    const data = parse(getSchema, input);
    const { orders } = await loadProductionOs(context.teamId);
    const order = orders.find((row) => row.id === data.task_id);
    if (!order) throw new Error(`No existe el pedido de producción ${data.task_id} en este equipo.`);
    return { order, ...cadenaDeTrabajo(order.workKind, order.id) };
  }



  throw new Error(`produccion: tool desconocida ${name}`);
}
