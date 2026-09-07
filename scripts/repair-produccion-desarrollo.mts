/**
 * Reparación de los `desarrollo` que no son producción, CONTRA LA BASE:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/repair-produccion-desarrollo.mts            # dry-run
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/repair-produccion-desarrollo.mts --apply    # escribe
 *
 * La migración 0108 marcó como `desarrollo / en_curso|aceptado` TODO lo que
 * vivía en el workspace «Clientes»: son los proyectos importados desde el
 * Command Center (uno por cliente), no trabajo que alguien esté produciendo.
 * Con eso el WIP de producción da 205 contra un máximo de 3 y ningún tablero
 * sirve. Tres grupos:
 *
 *   (a) sin movimiento en 30 días y sin sesiones de trabajo → dejan de ser
 *       pedidos (`work_kind = NULL, work_status = NULL`). Siguen siendo tareas;
 *       el `status` genérico no se toca.
 *   (b) con `delivery_url` → `entregado`: hay algo entregado, el pedido cerró.
 *   (c) el resto queda como está y se lista para decidirlo a mano.
 *
 * Sin `--apply` sólo cuenta y lista. Con `--apply` escribe en una transacción.
 */
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems, teamTaskWorkSessions } from '@/lib/db/schema';

const TEAM = Number(process.env.REPAIR_TEAM_ID ?? 2);
const APLICAR = process.argv.includes('--apply');
const DIAS_QUIETO = 30;

const filas = await db
  .select({
    id: teamTaskItems.id,
    title: teamTaskItems.title,
    workStatus: teamTaskItems.workStatus,
    deliveryUrl: teamTaskItems.deliveryUrl,
    updatedAt: teamTaskItems.updatedAt,
    sesiones: sql<number>`(select count(*) from ${teamTaskWorkSessions} s where s.task_id = ${teamTaskItems.id})::int`,
  })
  .from(teamTaskItems)
  .where(and(
    eq(teamTaskItems.teamId, TEAM),
    eq(teamTaskItems.workKind, 'desarrollo'),
    inArray(teamTaskItems.workStatus, ['en_curso', 'aceptado']),
    isNull(teamTaskItems.parentTaskId),
  ))
  .orderBy(teamTaskItems.updatedAt);

const limite = new Date(Date.now() - DIAS_QUIETO * 86_400_000);
const conEntrega = filas.filter((f) => f.deliveryUrl?.trim());
const quietos = filas.filter((f) => !f.deliveryUrl?.trim() && f.updatedAt < limite && f.sesiones === 0);
const resto = filas.filter((f) => !conEntrega.includes(f) && !quietos.includes(f));

const fecha = (d: Date) => d.toISOString().slice(0, 10);
const listar = (titulo: string, grupo: typeof filas) => {
  console.log(`\n${titulo}: ${grupo.length}`);
  for (const f of grupo.slice(0, 10)) console.log(`   #${f.id} · ${f.workStatus} · ${fecha(f.updatedAt)} · ${f.title.slice(0, 70)}${f.deliveryUrl ? ` → ${f.deliveryUrl}` : ''}`);
  if (grupo.length > 10) console.log(`   … y ${grupo.length - 10} más`);
};

console.log(`Equipo ${TEAM} · ${filas.length} pedidos «desarrollo» en en_curso/aceptado · modo ${APLICAR ? 'APPLY' : 'dry-run'}`);
listar(`(a) Sin movimiento en ${DIAS_QUIETO} días y sin sesiones → dejan de ser pedidos`, quietos);
listar('(b) Con enlace de entrega → entregado', conEntrega);
listar('(c) Quedan como están (decidir a mano)', resto);

if (!APLICAR) {
  console.log('\nDry-run: no se escribió nada. Corré con --apply para aplicar (a) y (b).');
  process.exit(0);
}

await db.transaction(async (tx) => {
  if (quietos.length) {
    await tx.update(teamTaskItems)
      .set({ workKind: null, workStatus: null, updatedAt: new Date() })
      .where(and(eq(teamTaskItems.teamId, TEAM), inArray(teamTaskItems.id, quietos.map((f) => f.id))));
  }
  if (conEntrega.length) {
    await tx.update(teamTaskItems)
      .set({ workStatus: 'entregado', status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(teamTaskItems.teamId, TEAM), inArray(teamTaskItems.id, conEntrega.map((f) => f.id)), isNotNull(teamTaskItems.deliveryUrl), lt(teamTaskItems.updatedAt, new Date(Date.now() + 1))));
  }
});
console.log(`\nAplicado: ${quietos.length} vuelven a ser tareas comunes, ${conEntrega.length} pasan a entregado, ${resto.length} quedan para decidir.`);
process.exit(0);
