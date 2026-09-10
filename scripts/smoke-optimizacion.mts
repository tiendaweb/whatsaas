/**
 * Smoke de la tanda de optimización, CONTRA LA BASE (sólo lectura salvo donde
 * se aclara; lo que escribe, lo borra):
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-optimizacion.mts
 *
 * Cubre lo que el chequeo de tipos no puede ver: SQL que compila y explota en
 * runtime (GROUP BY con parámetros, Date dentro de un FILTER, columnas que no
 * existen) y las reglas nuevas de la cola.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCommercialActions } from '@/lib/db/schema';
import { cierreSemanal } from '@/lib/plugins/sales-ops/server/cierre';
import { pendienteDelContacto } from '@/lib/plugins/sales-ops/server/pendiente';
import { proposeBatch, rejectionLessons, rejectionLessonsText } from '@/lib/plugins/sales-ops/server/queue';
import { listPendingChats } from '@/lib/plugins/sales-ops/server/classifier';
import { getSalesOpsSettings } from '@/lib/plugins/sales-ops/server/settings';
import { horasPorContexto, sesionAbierta } from '@/lib/plugins/tasks/server/work-sessions';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
let fallos = 0;
const ok = (nombre: string, condicion: boolean, detalle = '') => {
  console.log(`${condicion ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos += 1;
};

// ── 1. Cierre semanal ────────────────────────────────────────────────────────
const cierre = await cierreSemanal(TEAM, 7);
ok('cierreSemanal corre contra la base', typeof cierre.decisiones.total === 'number',
  `${cierre.decisiones.total} decisiones · ${cierre.alCliente.enviados + cierre.alCliente.programados} al cliente · ${cierre.entregas.conEnlace} entregas con enlace · ${cierre.horas.total} h`);
ok('las monedas no se suman entre sí', Object.keys(cierre.cobrado).every((k) => k.length === 3), JSON.stringify(cierre.cobrado));
ok('cuenta lo que sigue esperando', cierre.decisiones.pendientes >= 0, `${cierre.decisiones.pendientes} sin decidir, la más vieja hace ${cierre.decisiones.masViejaHoras ?? 0} h`);

// ── 2. Trabajo pendiente por contacto ────────────────────────────────────────
const [conCola] = await db
  .select({ chatId: teamCommercialActions.chatId, contactId: teamCommercialActions.contactId })
  .from(teamCommercialActions)
  .where(and(eq(teamCommercialActions.teamId, TEAM), inArray(teamCommercialActions.status, ['proposed', 'approved'])))
  .limit(1);
if (conCola) {
  const pendiente = await pendienteDelContacto(TEAM, conCola.chatId, { contactId: conCola.contactId });
  ok('pendienteDelContacto arma el trabajo abierto', pendiente.total > 0,
    `chat ${conCola.chatId}: ${pendiente.total} ítems (${pendiente.esperaDecision} esperan decisión)`);
  ok('cada ítem dice con qué se cierra', pendiente.items.every((i) => i.tools.length > 0),
    pendiente.items.map((i) => i.tipo).join(', '));
} else {
  ok('pendienteDelContacto: sin filas vivas para probar', true, 'saltado');
}

// ── 3. Lecciones de rechazo ──────────────────────────────────────────────────
const lecciones = await rejectionLessons(TEAM, { kind: 'send_message', days: 30 });
ok('rejectionLessons corre', Array.isArray(lecciones.lessons),
  `${lecciones.total} rechazos con motivo tipado (los viejos no cuentan, no tienen código)`);
const texto = await rejectionLessonsText(TEAM, 'send_message');
ok('las lecciones se pueden meter en un prompt', typeof texto === 'string', texto ? `${texto.length} caracteres` : 'vacío: todavía no hay motivos tipados');

// ── 4. Techo de decisiones (dry-run: no escribe) ─────────────────────────────
const settings = await getSalesOpsSettings(TEAM);
const [{ vivas = 0 } = { vivas: 0 }] = await db
  .select({ vivas: sql<number>`count(*)::int` })
  .from(teamCommercialActions)
  .where(and(eq(teamCommercialActions.teamId, TEAM), inArray(teamCommercialActions.status, ['proposed', 'pending_approval'])));
const dry = await proposeBatch(TEAM, {
  label: 'smoke · techo de decisiones',
  kind: 'send_message',
  requiresRole: 'any',
  gates: ['G5'],
  payloadTemplate: { text: 'Hola {{nombre}}, ¿seguimos?' },
  proposedBy: 'ia',
  dryRun: true,
});
const tope = settings.maxDecisionesVivas ?? 25;
ok('el techo recorta el lote', dry.included.length <= Math.max(0, tope - vivas),
  `${vivas} vivas contra tope ${tope} → entran ${dry.included.length}, quedan ${dry.cap?.postergadas ?? 0} para después`);
ok('lo postergado se explica', (dry.cap?.postergadas ?? 0) === 0 || dry.excluded.some((e) => /tope|lugares/.test(e.reason)),
  dry.excluded.find((e) => /tope|lugares/.test(e.reason))?.reason ?? 'nada postergado');
ok('el dry-run no escribió nada', dry.batchId === null);

// ── 5. No reclasificar lo que no cambió ──────────────────────────────────────
const pendientesIa = await listPendingChats(TEAM, { source: 'all', limit: 500 });
const porMotivo = pendientesIa.reduce<Record<string, number>>((acc, p) => {
  acc[p.pendingReason] = (acc[p.pendingReason] ?? 0) + 1;
  return acc;
}, {});
ok('listPendingChats corre con el filtro nuevo', Array.isArray(pendientesIa),
  `${pendientesIa.length} chats pendientes: ${JSON.stringify(porMotivo)}`);
const staleTotal = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(teamCommercialActions)
  .where(eq(teamCommercialActions.teamId, TEAM));
ok('la consulta de acciones sigue viva', (staleTotal[0]?.n ?? 0) >= 0);

// ── 6. Sesiones de bloque ────────────────────────────────────────────────────
const horas = await horasPorContexto(TEAM, new Date(Date.now() - 30 * 86_400_000));
ok('horasPorContexto agrupa sin romper el GROUP BY', typeof horas === 'object', JSON.stringify(horas));
const abierta = await sesionAbierta(TEAM, 1);
ok('sesionAbierta responde', abierta === null || typeof abierta.context === 'string', abierta ? abierta.context : 'ninguna abierta');

console.log(`\n${fallos === 0 ? 'Todo en verde' : `${fallos} chequeos fallaron`}`);
process.exit(fallos === 0 ? 0 : 1);
