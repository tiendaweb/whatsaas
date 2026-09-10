import 'server-only';

import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  teamCommercialActions,
  teamCommercialSignals,
  teamSales,
  teamTaskItems,
  teamTaskWorkSessions,
} from '@/lib/db/schema';

/**
 * Los seis números de cierre de la semana.
 *
 * El sistema tiene tres tableros —Métricas del Command Center, Resumen de
 * Radar, Métricas de Tareas— y el Muro auditando todo, y ninguno contesta la
 * única pregunta semanal que importa: cuántas decisiones se tomaron, cuánto
 * salió al cliente, cuánto se entregó y a qué costo de horas. Todos miden
 * actividad —cuántas clasificaciones, cuántas señales, cuántas llamadas— y la
 * actividad sube justo cuando el sistema genera trabajo que nadie cierra.
 *
 * Acá se cuenta lo contrario: sólo cosas terminadas. Si un número da cero, esa
 * semana esa parte del sistema no produjo nada, por más movimiento que hubiera.
 */

export type CierreSemanal = {
  desde: string;
  hasta: string;
  dias: number;
  /** Filas de la cola que dejaron de estar sin decidir (aprobadas o rechazadas). */
  decisiones: { total: number; aprobadas: number; rechazadas: number; pendientes: number; masViejaHoras: number | null };
  /** Lo que de verdad le llegó a un cliente. */
  alCliente: { enviados: number; programados: number };
  /** Respuestas de clientes cerradas contra las que entraron. */
  respuestas: { atendidas: number; nuevas: number; pendientes: number };
  /** Pedidos de producción entregados, y cuántos con enlace (los únicos que cuentan). */
  entregas: { entregados: number; conEnlace: number; enCurso: number };
  /** Horas de bloque registradas, por contexto. */
  horas: { total: number; porContexto: Record<string, number> };
  /** Plata cobrada en la ventana, por moneda. Nunca se suman entre sí. */
  cobrado: Record<string, number>;
};

const DIA = 86_400_000;

/**
 * Las fechas van con los helpers de drizzle (`gte`), NUNCA como parámetro
 * dentro de un `sql` template: postgres.js recibe el Date crudo y tira
 * "The 'string' argument must be of type string" en runtime, con el build y el
 * chequeo de tipos en verde. Ya pasó con `date_trunc` y con un FILTER.
 */

export async function cierreSemanal(teamId: number, dias = 7): Promise<CierreSemanal> {
  const ventana = Math.min(Math.max(1, dias), 90);
  const desde = new Date(Date.now() - ventana * DIA);
  const ahora = new Date();

  const [acciones, senales, produccion, sesiones, ventas, pendientes] = await Promise.all([
    db
      .select({ status: teamCommercialActions.status, kind: teamCommercialActions.kind, n: sql<number>`count(*)::int` })
      .from(teamCommercialActions)
      .where(and(eq(teamCommercialActions.teamId, teamId), gte(teamCommercialActions.updatedAt, desde)))
      // `group by 1, 2` por posición: con los parámetros del where, drizzle
      // renumera las expresiones y Postgres deja de reconocerlas.
      .groupBy(sql`1`, sql`2`),
    db
      .select({ status: teamCommercialSignals.status, n: sql<number>`count(*)::int` })
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), gte(teamCommercialSignals.createdAt, desde)))
      .groupBy(sql`1`),
    db
      .select({
        workStatus: teamTaskItems.workStatus,
        conEnlace: sql<number>`count(*) filter (where coalesce(${teamTaskItems.deliveryUrl}, '') <> '')::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(teamTaskItems)
      .where(
        and(
          eq(teamTaskItems.teamId, teamId),
          sql`${teamTaskItems.workKind} IS NOT NULL`,
          gte(teamTaskItems.updatedAt, desde),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({ context: teamTaskWorkSessions.context, minutos: sql<number>`coalesce(sum(${teamTaskWorkSessions.minutes}), 0)::int` })
      .from(teamTaskWorkSessions)
      .where(
        and(
          eq(teamTaskWorkSessions.teamId, teamId),
          eq(teamTaskWorkSessions.kind, 'foco'),
          gte(teamTaskWorkSessions.startedAt, desde),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({ currency: teamSales.currency, total: sql<number>`coalesce(sum(${teamSales.total}), 0)::bigint` })
      .from(teamSales)
      .where(and(eq(teamSales.teamId, teamId), and(isNotNull(teamSales.paidAt), gte(teamSales.paidAt, desde))))
      .groupBy(sql`1`),
    db
      .select({
        n: sql<number>`count(*)::int`,
        masVieja: sql<Date | null>`min(${teamCommercialActions.createdAt})`,
      })
      .from(teamCommercialActions)
      .where(and(eq(teamCommercialActions.teamId, teamId), inArray(teamCommercialActions.status, ['proposed', 'pending_approval']))),
  ]);

  const suma = (pred: (row: (typeof acciones)[number]) => boolean) => acciones.filter(pred).reduce((acc, r) => acc + r.n, 0);
  const aprobadas = suma((r) => ['approved', 'executing', 'executed', 'resulted'].includes(r.status));
  const rechazadas = suma((r) => ['rejected', 'expired'].includes(r.status));
  const enviados = suma((r) => r.kind === 'send_message' && ['executed', 'resulted'].includes(r.status));
  const programados = suma((r) => r.kind === 'schedule_message' && ['executed', 'resulted'].includes(r.status));

  const senalPorEstado = (estado: string) => senales.find((s) => s.status === estado)?.n ?? 0;
  const senalesPendientes = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamCommercialSignals)
    .where(and(eq(teamCommercialSignals.teamId, teamId), inArray(teamCommercialSignals.status, ['new', 'seen'])));

  const entregados = produccion.filter((p) => p.workStatus === 'entregado' || p.workStatus === 'activado');
  const enCurso = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamTaskItems)
    .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.workStatus, ['en_curso', 'qa'])));

  const porContexto: Record<string, number> = {};
  let minutosTotales = 0;
  for (const s of sesiones) {
    const horas = Math.round((s.minutos / 60) * 10) / 10;
    porContexto[s.context] = horas;
    minutosTotales += s.minutos;
  }

  const cobrado: Record<string, number> = {};
  // Finanzas guarda en centavos; acá se muestra en unidades y NUNCA se suman
  // monedas entre sí.
  for (const v of ventas) cobrado[v.currency ?? 'ARS'] = Math.round(Number(v.total ?? 0)) / 100;

  const masVieja = pendientes[0]?.masVieja ? new Date(pendientes[0].masVieja) : null;

  return {
    desde: desde.toISOString(),
    hasta: ahora.toISOString(),
    dias: ventana,
    decisiones: {
      total: aprobadas + rechazadas,
      aprobadas,
      rechazadas,
      pendientes: pendientes[0]?.n ?? 0,
      masViejaHoras: masVieja ? Math.round((ahora.getTime() - masVieja.getTime()) / 3_600_000) : null,
    },
    alCliente: { enviados, programados },
    respuestas: {
      atendidas: senalPorEstado('handled') + senalPorEstado('dismissed'),
      nuevas: senales.reduce((acc, s) => acc + s.n, 0),
      pendientes: senalesPendientes[0]?.n ?? 0,
    },
    entregas: {
      entregados: entregados.reduce((acc, p) => acc + p.n, 0),
      conEnlace: entregados.reduce((acc, p) => acc + p.conEnlace, 0),
      enCurso: enCurso[0]?.n ?? 0,
    },
    horas: { total: Math.round((minutosTotales / 60) * 10) / 10, porContexto },
    cobrado,
  };
}
