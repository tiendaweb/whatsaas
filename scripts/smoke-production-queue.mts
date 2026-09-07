/**
 * Smoke de la cola de producción para conectores, CONTRA LA BASE:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-production-queue.mts
 *
 * Verifica lo que un conector va a ver y los dos frenos que no se aflojan: no
 * se entrega sin enlace y no se saltean estados. Escribe SÓLO sobre un pedido
 * de prueba que crea y borra... en realidad ni eso: las validaciones se prueban
 * pidiendo transiciones inválidas sobre pedidos reales, que fallan ANTES de
 * tocar nada. Nada queda modificado.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems } from '@/lib/db/schema';
import { listProductionWorkQueue } from '@/lib/plugins/tasks/server/production-work-queue';
import { updateProductionOrder } from '@/lib/plugins/tasks/server/production-os';
import { CADENA_POR_TIPO, WORK_KINDS, cadenaDeTrabajo, puedeTransicionar } from '@/lib/plugins/tasks/shared/produccion';

const TEAM = 2;
let fallas = 0;
const check = (nombre: string, ok: boolean, detalle?: unknown) => {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle !== undefined ? ` → ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}` : ''}`);
  if (!ok) fallas += 1;
};

// 1. Todos los tipos tienen receta, y la receta nombra la tool que corresponde.
check('los 12 tipos tienen cadena', WORK_KINDS.every((k) => CADENA_POR_TIPO[k]?.tools.length > 0 && CADENA_POR_TIPO[k].steps.length > 0));
const esperado: Array<[(typeof WORK_KINDS)[number], string]> = [
  ['demo_sitio_aapp', 'gobiz_sites_create'],
  ['demo_tienda_aapp', 'gobiz_stores_create'],
  ['demo_prosite', 'gobiz_prosites_create'],
  ['demo_html', 'gobiz_html_create'],
  ['tienda_aapp', 'gobiz_store_products_create'],
  ['prosite', 'gobiz_prosites_publish'],
  ['desarrollo', 'whatspro_manage_task'],
];
for (const [kind, tool] of esperado) check(`${kind} usa ${tool}`, CADENA_POR_TIPO[kind].tools.includes(tool));
check('los pasos reemplazan {id}', !cadenaDeTrabajo('demo_html', 4242).steps.join(' ').includes('{id}') && cadenaDeTrabajo('demo_html', 4242).steps.join(' ').includes('4242'));
check('entregar exige enlace en los pasos', CADENA_POR_TIPO.demo_sitio_aapp.steps.some((s) => /delivery_url/.test(s) && /sin enlace/i.test(s)));

// 2. La cola real del equipo.
const cola = await listProductionWorkQueue(TEAM, { limit: 50 });
check('la cola responde con reglas y conteos', cola.rules.length >= 5 && typeof cola.counts.total === 'number', { total: cola.counts.total, porEstado: cola.counts.byStatus, porFamilia: cola.counts.byFamily });
check('ningún ítem espera al cliente', cola.items.every((i) => i.workStatus !== 'espera_cliente'));
check('ningún ítem viene entregado o descartado', cola.items.every((i) => i.workStatus !== 'entregado' && i.workStatus !== 'descartado'));
check('todos traen tools y pasos', cola.items.every((i) => i.tools.length > 0 && i.steps.length > 0));
check('vienen ordenados por prioridad', cola.items.every((it, i, arr) => i === 0 || arr[i - 1].priority >= it.priority));
const familias = [...new Set(cola.items.map((i) => i.family))];
check('las demos van antes que la producción', !(familias.includes('demo') && familias.includes('produccion')) || familias.indexOf('demo') < familias.indexOf('produccion'), familias.join(' → '));
if (cola.items[0]) {
  const primero = cola.items[0];
  console.log(`   primero: #${primero.taskId} ${primero.workKindLabel} · ${primero.title} (${primero.workStatusLabel}${primero.parties[0] ? `, ${primero.parties[0].name}` : ''})`);
}

// 3. Los frenos. Se piden transiciones inválidas: fallan antes de escribir.
check('pedido → entregado no es una transición válida', !puedeTransicionar('pedido', 'entregado'));
const [entregable] = await db
  .select({ id: teamTaskItems.id, workStatus: teamTaskItems.workStatus })
  .from(teamTaskItems)
  .where(and(eq(teamTaskItems.teamId, TEAM), eq(teamTaskItems.workStatus, 'pedido')))
  .limit(1);
if (entregable) {
  try {
    await updateProductionOrder(TEAM, 1, entregable.id, { workStatus: 'entregado', deliveryUrl: 'https://ejemplo.test/demo' }, 'connector');
    check('el servidor rechaza pedido → entregado', false);
  } catch (error) {
    check('el servidor rechaza pedido → entregado', /No se puede pasar/.test(String((error as Error).message)), (error as Error).message);
  }
  // "Entregar sin enlace" se prueba sobre un pedido que YA está en curso (esa
  // transición sí es válida), así el rechazo viene del enlace y no del estado.
  const [enCurso] = await db
    .select({ id: teamTaskItems.id })
    .from(teamTaskItems)
    .where(and(eq(teamTaskItems.teamId, TEAM), eq(teamTaskItems.workStatus, 'en_curso')))
    .limit(1);
  if (enCurso) {
    try {
      await updateProductionOrder(TEAM, 1, enCurso.id, { workStatus: 'entregado', deliveryUrl: '' }, 'connector');
      check('el servidor rechaza entregar sin enlace', false);
    } catch (error) {
      check('el servidor rechaza entregar sin enlace', /enlace de entrega/i.test(String((error as Error).message)), (error as Error).message);
    }
  }
} else {
  console.log('   (sin pedidos en estado "pedido": no se probaron los frenos contra la base)');
}

console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
