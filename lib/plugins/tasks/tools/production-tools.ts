import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { loadProductionOs } from '@/lib/plugins/tasks/server/production-os';
import { listProductionWorkQueue } from '@/lib/plugins/tasks/server/production-work-queue';
import { registrarSesionManual, resumenHorasPorTarea } from '@/lib/plugins/tasks/server/work-sessions';
import { CATALOGO_AAPP, REFERENCIA_ARS_POR_USD, REFERENCIA_FECHA, VIGENCIA_HASTA, catalogoVigente, type FamiliaCatalogo } from '@/lib/plugins/tasks/shared/catalogo';
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
      + 'tipo. Trae también lo que el Protocolo Maestro mide: horas reales (sesiones de trabajo), ticket y ticketUsd, evaluacion con '
      + 'US$/h y nivel (alta / revisar / segundo_plano; línea roja: más de 6 h con menos de US$ 250), rondas de revisión incluidas y usadas, '
      + 'estado del pago, ficha de handoff con lo que falta y el ítem del catálogo del que nació. Es el primer paso de cualquier pedido que vayas a hacer.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: { task_id: { type: 'integer', minimum: 1, description: 'Id del pedido (viene en whatspro_production_work_queue).' } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_catalog_list',
    description:
      'El Catálogo Operativo AAPP SPACE 2026 en código: los precios REALES (ARS y USD) de sitios, tiendas, chatbot, AAPP CAZA/PILOTO/TORRE, kits de redes '
      + 'y desarrollo a medida, con qué incluye cada uno, recurrencia, rondas de revisión incluidas y horas objetivo. Usalo para cotizar y para elegir '
      + 'catalog_key al crear un pedido: un precio que no está acá no se inventa ni se lee de un HTML. Trae la referencia ARS/USD del documento y hasta '
      + 'cuándo está vigente (el catálogo se congeló 30 días); si venció sigue siendo la fuente, pero avisá que hay que revisarlo.',
    inputSchema: {
      type: 'object',
      properties: {
        family: { type: 'string', enum: ['space', 'chatbot', 'business', 'redes', 'medida'], description: 'space = caja rápida AAPP SPACE; chatbot = planes mensuales; business = CAZA/PILOTO/TORRE; redes = kits (desincentivados); medida = a cotizar.' },
        include_desincentivados: { type: 'boolean', description: 'Incluir redes y desarrollo a medida, que el catálogo dice que existen pero no se empujan. Por defecto no.' },
      },
      additionalProperties: false,
    },
  },
];

/**
 * `whatspro_production_create` y `whatspro_production_update` viven en
 * `lib/plugins/sales-ops/tools/tareas-tools.ts` (el chat es el que pide el
 * trabajo, así que nacieron ahí) y NO se duplican acá. Lo que sí es de este
 * módulo: registrar el tiempo, que es el dato que el protocolo pide medir.
 */
export const productionActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_production_log_time',
    description:
      'Registra tiempo trabajado sobre un pedido de producción, en minutos. Es la fuente de las horas REALES que el Protocolo Maestro pide medir '
      + '(«si no medimos horas, volvemos al mismo problema»): con el ticket del pedido salen los US$/h y la línea roja (más de 6 h con menos de US$ 250 '
      + 'no entra como prioridad normal). Usala al cerrar cada pedido o cada tanda; el descanso no se registra. Devuelve el resumen de horas del pedido. Requiere tasksWrite.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'minutes'],
      properties: {
        task_id: { type: 'integer', minimum: 1, description: 'Id del pedido.' },
        minutes: { type: 'integer', minimum: 1, maximum: 600, description: 'Minutos de trabajo efectivo. Máximo 10 horas por registro.' },
        note: { type: 'string', maxLength: 500, description: 'Qué se hizo en ese tiempo (opcional). Sirve para separar retrabajo de producción.' },
      },
      additionalProperties: false,
    },
  },
];

const queueSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  family: z.enum(['demo', 'produccion', 'cambio']).optional(),
  work_kinds: z.array(z.enum(WORK_KINDS)).max(12).optional(),
});

const getSchema = z.object({ task_id: z.number().int().positive() });
const catalogSchema = z.object({
  family: z.enum(['space', 'chatbot', 'business', 'redes', 'medida']).optional(),
  include_desincentivados: z.boolean().optional(),
});
const logTimeSchema = z.object({
  task_id: z.number().int().positive(),
  minutes: z.number().int().min(1).max(600),
  note: z.string().max(500).optional(),
});


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

  if (name === 'whatspro_catalog_list') {
    await assertPermission(context, 'tasksRead', 'tasks');
    const data = parse(catalogSchema, input);
    const items = CATALOGO_AAPP.filter((item) => {
      if (data.family && item.familia !== (data.family as FamiliaCatalogo)) return false;
      if (item.desincentivado && !data.include_desincentivados && !data.family) return false;
      return true;
    });
    const vigente = catalogoVigente();
    return {
      vigente_hasta: VIGENCIA_HASTA,
      vigente,
      referencia: { ars_por_usd: REFERENCIA_ARS_POR_USD, fecha: REFERENCIA_FECHA },
      note: vigente
        ? 'Precios reales del Catálogo Operativo AAPP SPACE 2026 (v1.2). Lo que no está acá no se inventa: se cotiza con una persona. Los USD se redondean al dólar entero superior con la referencia indicada.'
        : `El catálogo estaba congelado hasta ${VIGENCIA_HASTA} y ya venció: estos siguen siendo los precios de referencia, pero avisá que hay que revisarlos antes de prometer uno.`,
      total: items.length,
      items: items.map((item) => ({
        key: item.key,
        nombre: item.nombre,
        familia: item.familia,
        work_kind: item.workKind,
        precio_ars: item.precioArs,
        precio_usd: item.precioUsd,
        recurrencia: item.recurrencia,
        rondas_incluidas: item.rondasIncluidas,
        horas_objetivo: item.horasObjetivo,
        incluye: item.incluye,
        desincentivado: Boolean(item.desincentivado),
      })),
    };
  }

  if (name === 'whatspro_production_log_time') {
    await assertPermission(context, 'tasksWrite', 'tasks');
    const data = parse(logTimeSchema, input);
    await registrarSesionManual(context.teamId, context.userId, data.task_id, data.minutes, data.note);
    const resumen = (await resumenHorasPorTarea(context.teamId, [data.task_id])).get(data.task_id) ?? { minutosFoco: data.minutes, sesiones: 1, sesionAbierta: false };
    return {
      success: true,
      taskId: data.task_id,
      registrado: { minutes: data.minutes, note: data.note ?? null },
      minutosTrabajados: resumen.minutosFoco,
      horas: Math.round((resumen.minutosFoco / 60) * 100) / 100,
      sesiones: resumen.sesiones,
      note: 'Tiempo registrado. Con el ticket del pedido, whatspro_production_get devuelve los US$/h y si entra en la línea roja.',
    };
  }

  throw new Error(`produccion: tool desconocida ${name}`);
}
