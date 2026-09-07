import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import { cadenaDeTrabajo, FAMILIA_LABEL, WORK_KIND_META, WORK_STATUS_META, type Familia, type WorkKind, type WorkStatus } from '../shared/produccion';
import { loadProductionOs, type ProductionOrder } from './production-os';

/**
 * Cola de trabajo de producción para conectores.
 *
 * Es el equivalente de `lib/plugins/sales-ops/server/work-queue.ts` del lado de
 * producción: el conector pide la cola, recibe cada pedido con su cadena exacta
 * de tools y sus pasos, lo resuelve y cierra con `whatspro_production_update`.
 *
 * Por qué existe: Producción OS ya tenía el tablero, pero un conector que
 * quería ayudar tenía que leer la pantalla, adivinar con qué tool se hace una
 * tienda de AAPP SPACE y recordar que "entregado" necesita enlace. Los tres
 * datos viven ahora en el ítem.
 *
 * Qué entra: lo que espera a producción (`pedido`), lo aceptado sin arrancar
 * (`aceptado`), los cambios pedidos sobre algo entregado (`cambios`) y lo que
 * está `en_curso` asignado a quien pregunta. Lo que espera al CLIENTE no entra:
 * ahí no hay nada que un conector pueda hacer, y ofrecerlo es mandarlo a
 * escribirle a alguien que no le toca.
 */

export type ProductionWorkItem = {
  kind: 'produccion';
  priority: number;
  taskId: number;
  title: string;
  workKind: WorkKind;
  workKindLabel: string;
  family: Familia;
  familyLabel: string;
  workStatus: WorkStatus;
  workStatusLabel: string;
  /** Cliente o contacto del pedido, sin teléfonos. */
  parties: Array<{ type: string; id: number; name: string; chatId: number | null }>;
  chatId: number | null;
  notes: string;
  aiPrompt: string;
  checklist: Array<{ id: string; text: string; completed: boolean }>;
  checklistDone: number;
  deliveryUrl: string | null;
  blockedReason: string | null;
  dueDate: string | null;
  assigneeName: string | null;
  requestedByName: string | null;
  tools: string[];
  steps: string[];
};

export type ProductionWorkQueue = {
  generatedAt: string;
  counts: { total: number; byStatus: Record<string, number>; byFamily: Record<string, number> };
  items: ProductionWorkItem[];
  rules: string[];
};

export const PRODUCTION_RULES = [
  'Un pedido por vez, de arriba hacia abajo: la lista ya viene ordenada (demos primero, después cambios, después producción).',
  'Antes de arrancar, tomá el pedido: whatspro_production_update {task_id, work_status: "aceptado"}. Así producción ve que alguien lo está haciendo y no lo hacen dos veces.',
  'Cada tipo de trabajo tiene SU tool y no se convierten entre sí: un sitio de una página es gobiz_sites_create, una tienda es gobiz_stores_create, un sitio profesional de varias páginas es gobiz_prosites_create y un HTML propio es gobiz_html_create. Elegir mal obliga a rehacerlo entero.',
  'Nunca marques "entregado" sin delivery_url: el enlace es la entrega. El servidor lo rechaza, y con razón.',
  'Si falta material del cliente (logo, textos, fotos, accesos, dominio), dejalo en "espera_cliente" con blocked_reason y seguí con otro. NO le escribas al cliente: eso se pide desde el Command Center Comercial, que es donde se decide qué se le dice a cada uno.',
  'Si el pedido trae ai_prompt, usalo tal cual como brief: lo escribió quien habló con el cliente.',
  'Los textos del sitio salen del brief y del chat, no de tu imaginación: nada de "Lorem ipsum", teléfonos inventados ni precios que nadie dijo. Si falta un dato para que el sitio se entienda, es "espera_cliente".',
  'Revisá el resultado en pantalla angosta antes de entregar: casi todos los clientes lo van a abrir del celular.',
  'Cerrá SIEMPRE con whatspro_production_update contando qué hiciste en summary; sin eso el servidor no se entera y el pedido sigue figurando pendiente.',
];

/** Familia primero (demos, cambios, producción), después vencimiento y antigüedad. */
const PESO_FAMILIA: Record<Familia, number> = { demo: 3000, cambio: 2000, produccion: 1000 };
const PESO_ESTADO: Record<string, number> = { pedido: 300, cambios: 250, aceptado: 200, en_curso: 100 };

function prioridadDe(order: ProductionOrder, index: number): number {
  const vencido = order.dueDate && new Date(order.dueDate).getTime() < Date.now() ? 400 : 0;
  return PESO_FAMILIA[order.family] + (PESO_ESTADO[order.workStatus] ?? 0) + vencido - index;
}

export type ProductionQueueOptions = {
  limit?: number;
  /** Sólo estos tipos de trabajo. */
  workKinds?: WorkKind[];
  /** Sólo esta familia. */
  family?: Familia;
  /** `userId` de quien pide: sus `en_curso` también son trabajo suyo. */
  forUserId?: number | null;
};

/** Estados que un conector puede tomar sin que nadie más decida nada. */
const ESTADOS_TOMABLES: WorkStatus[] = ['pedido', 'aceptado', 'cambios'];

export async function listProductionWorkQueue(teamId: number, opts: ProductionQueueOptions = {}): Promise<ProductionWorkQueue> {
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 100);
  const { orders } = await loadProductionOs(teamId);

  const candidatos = orders.filter((order) => {
    if (opts.family && order.family !== opts.family) return false;
    if (opts.workKinds?.length && !opts.workKinds.includes(order.workKind)) return false;
    if (ESTADOS_TOMABLES.includes(order.workStatus)) return true;
    // Lo que ya está en curso sólo aparece para quien lo tiene asignado: es su
    // trabajo a medias, no un pedido libre que otro pueda agarrar.
    return order.workStatus === 'en_curso' && opts.forUserId != null && order.assigneeId === opts.forUserId;
  });

  const items: ProductionWorkItem[] = candidatos.slice(0, limit).map((order, index) => {
    const cadena = cadenaDeTrabajo(order.workKind, order.id);
    const chatId = order.parties.find((party) => party.chatId != null)?.chatId ?? null;
    return {
      kind: 'produccion',
      priority: prioridadDe(order, index),
      taskId: order.id,
      title: order.title,
      workKind: order.workKind,
      workKindLabel: WORK_KIND_META[order.workKind].label,
      family: order.family,
      familyLabel: FAMILIA_LABEL[order.family],
      workStatus: order.workStatus,
      workStatusLabel: WORK_STATUS_META[order.workStatus].label,
      parties: order.parties.map((party) => ({ type: party.type, id: party.id, name: party.name, chatId: party.chatId })),
      chatId,
      notes: order.notes.slice(0, 4000),
      aiPrompt: order.aiPrompt.slice(0, 8000),
      checklist: order.checklist,
      checklistDone: order.checklistDone,
      deliveryUrl: order.deliveryUrl,
      blockedReason: order.blockedReason,
      dueDate: order.dueDate,
      assigneeName: order.assigneeName,
      requestedByName: order.requestedByName,
      tools: cadena.tools,
      steps: cadena.steps,
    };
  });

  items.sort((a, b) => b.priority - a.priority);

  const byStatus: Record<string, number> = {};
  const byFamily: Record<string, number> = {};
  for (const order of candidatos) {
    byStatus[order.workStatus] = (byStatus[order.workStatus] ?? 0) + 1;
    byFamily[order.family] = (byFamily[order.family] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: { total: candidatos.length, byStatus, byFamily },
    items,
    rules: PRODUCTION_RULES,
  };
}

/** ¿El equipo tiene la app de Tareas encendida? La cola federada lo pregunta antes de mirar. */
export async function produccionHabilitada(teamId: number): Promise<boolean> {
  const row = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, 'tasks')),
    columns: { enabled: true },
  });
  return Boolean(row?.enabled);
}
