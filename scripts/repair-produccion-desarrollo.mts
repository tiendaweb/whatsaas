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
    projectId: teamTaskItems.projectId,
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

/**
 * (d) Tareas de un proyecto de cliente, no pedidos.
 *
 * Lo que muestra la base: 96 de las 235 son del proyecto «Looppy · Plataforma»
 * y 43 de «Almamia», con títulos como "Definir lógica del sistema de puntos" o
 * "Mejorar interfaz general". Eso no es un entregable que se le prometió a
 * nadie: es el backlog de un desarrollo cuyo pedido es el PROYECTO. La
 * migración 0108 tipó todo lo que vivía en el workspace de clientes y por eso
 * el WIP da 235 contra un máximo de 3.
 *
 * El corte es cuántos hermanos abiertos tiene en su proyecto: con cuatro o más,
 * es backlog. Con uno a tres, puede ser un trabajo puntual del cliente y se
 * respeta. Destipar no borra nada —la tarea sigue igual en su tablero, con su
 * estado y su responsable—: sólo deja de contar como pedido de producción.
 */
const MIN_HERMANOS_BACKLOG = 4;
const porProyecto = new Map<number, number>();
for (const f of filas) if (f.projectId != null) porProyecto.set(f.projectId, (porProyecto.get(f.projectId) ?? 0) + 1);
const backlog = filas.filter(
  (f) => !conEntrega.includes(f) && !quietos.includes(f) && f.projectId != null && (porProyecto.get(f.projectId) ?? 0) >= MIN_HERMANOS_BACKLOG,
);
const resto = filas.filter((f) => !conEntrega.includes(f) && !quietos.includes(f) && !backlog.includes(f));

const fecha = (d: Date) => d.toISOString().slice(0, 10);
const listar = (titulo: string, grupo: typeof filas) => {
  console.log(`\n${titulo}: ${grupo.length}`);
  for (const f of grupo.slice(0, 10)) console.log(`   #${f.id} · ${f.workStatus} · ${fecha(f.updatedAt)} · ${f.title.slice(0, 70)}${f.deliveryUrl ? ` → ${f.deliveryUrl}` : ''}`);
  if (grupo.length > 10) console.log(`   … y ${grupo.length - 10} más`);
};

console.log(`Equipo ${TEAM} · ${filas.length} pedidos «desarrollo» en en_curso/aceptado · modo ${APLICAR ? 'APPLY' : 'dry-run'}`);
listar(`(a) Sin movimiento en ${DIAS_QUIETO} días y sin sesiones → dejan de ser pedidos`, quietos);
listar('(b) Con enlace de entrega → entregado', conEntrega);
listar(`(d) Backlog de un proyecto con ${MIN_HERMANOS_BACKLOG}+ tareas abiertas → dejan de ser pedidos`, backlog);
listar('(c) Quedan como están (decidir a mano)', resto);

if (!APLICAR) {
  console.log('\nDry-run: no se escribió nada. Corré con --apply para aplicar (a), (b) y (d).');
  process.exit(0);
}

await db.transaction(async (tx) => {
  if (quietos.length) {
    await tx.update(teamTaskItems)
      .set({ workKind: null, workStatus: null, updatedAt: new Date() })
      .where(and(eq(teamTaskItems.teamId, TEAM), inArray(teamTaskItems.id, quietos.map((f) => f.id))));
  }
  if (backlog.length) {
    await tx.update(teamTaskItems)
      .set({ workKind: null, workStatus: null, updatedAt: new Date() })
      .where(and(eq(teamTaskItems.teamId, TEAM), inArray(teamTaskItems.id, backlog.map((f) => f.id))));
  }
  if (conEntrega.length) {
    await tx.update(teamTaskItems)
      .set({ workStatus: 'entregado', status: 'done', completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(teamTaskItems.teamId, TEAM), inArray(teamTaskItems.id, conEntrega.map((f) => f.id)), isNotNull(teamTaskItems.deliveryUrl), lt(teamTaskItems.updatedAt, new Date(Date.now() + 1))));
  }
});
console.log(`\nAplicado: ${quietos.length + backlog.length} vuelven a ser tareas comunes (${backlog.length} de backlog de proyecto), ${conEntrega.length} pasan a entregado, ${resto.length} quedan para decidir.`);
process.exit(0);
