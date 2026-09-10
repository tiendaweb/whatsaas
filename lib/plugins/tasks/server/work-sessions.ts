import 'server-only';

import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskWorkSessions } from '@/lib/db/schema';

/**
 * Sesiones de trabajo sobre un pedido de producción.
 *
 * Es el dato que el Protocolo Maestro pide medir y que no existía: el reloj de
 * 25 minutos vivía en localStorage y se olvidaba al terminar el bloque. Acá
 * cada bloque (o un registro a mano) queda como una fila con inicio y fin, y
 * las horas reales de un pedido son la suma de esas filas. Con eso se calcula
 * US$/h y se aplica la línea roja del catálogo.
 *
 * Dos reglas que no son cosméticas:
 *  - Una sola sesión abierta por usuario: abrir otra cierra la anterior. Nadie
 *    trabaja dos pedidos a la vez, y si el navegador cambió de pedido sin
 *    avisar, la sesión vieja no queda corriendo para siempre.
 *  - Una sesión olvidada abierta (pestaña cerrada sin cerrar el bloque) cuenta
 *    como máximo UN bloque. Contar las horas hasta que alguien se acuerde
 *    inflaría justo el número que se quiere proteger.
 */

export type KindSesion = 'foco' | 'descanso';
export type SourceSesion = 'bloque' | 'manual' | 'connector';
/**
 * En qué se fue el bloque.
 *
 * Los cuatro relojes de 25 minutos del sistema —producción, Focus comercial,
 * Focus de supervisión y Modo Noelia— vivían cada uno en el localStorage de
 * quien lo abría y no dejaban rastro: una sola sesión en toda la base. Sin
 * horas no hay US$/h, y sin US$/h la línea roja del catálogo (más de 6 h por
 * menos de US$250) es decorativa. Ahora los cuatro escriben acá y `context`
 * dice cuál fue.
 */
export const CONTEXTOS_SESION = ['produccion', 'comercial', 'supervision', 'noelia'] as const;
export type ContextoSesion = (typeof CONTEXTOS_SESION)[number];
export const esContextoSesion = (v: unknown): v is ContextoSesion =>
  typeof v === 'string' && (CONTEXTOS_SESION as readonly string[]).includes(v);

/** Tope de una sesión sin cerrar: un bloque de foco. */
const MAX_MINUTOS_SESION_ABIERTA = 25;

const minutosEntre = (desde: Date, hasta: Date) => Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60_000));
const minutosAcotados = (desde: Date, hasta: Date) => Math.min(MAX_MINUTOS_SESION_ABIERTA, minutosEntre(desde, hasta));

export type ResumenHoras = {
  /** Minutos de foco cerrados + lo que lleva la sesión abierta (acotado a un bloque). */
  minutosFoco: number;
  /** Cuántas sesiones hubo, foco y descanso incluidos. */
  sesiones: number;
  sesionAbierta: { id: number; startedAt: string } | null;
};

/**
 * Cierra las sesiones abiertas del usuario en el equipo y devuelve cuántas
 * cerró. `minutes` se calcula al cerrar; acotado a un bloque, por lo de arriba.
 */
export async function cerrarSesion(teamId: number, userId: number): Promise<{ cerradas: number }> {
  const abiertas = await db
    .select({ id: teamTaskWorkSessions.id, startedAt: teamTaskWorkSessions.startedAt })
    .from(teamTaskWorkSessions)
    .where(and(eq(teamTaskWorkSessions.teamId, teamId), eq(teamTaskWorkSessions.userId, userId), isNull(teamTaskWorkSessions.endedAt)));
  const ahora = new Date();
  for (const sesion of abiertas) {
    await db
      .update(teamTaskWorkSessions)
      .set({ endedAt: ahora, minutes: minutosAcotados(sesion.startedAt, ahora) })
      .where(eq(teamTaskWorkSessions.id, sesion.id));
  }
  return { cerradas: abiertas.length };
}

/** Abre una sesión sobre el pedido. Antes cierra la que el usuario tuviera abierta. */
export async function abrirSesion(
  teamId: number,
  userId: number,
  taskId: number,
  kind: KindSesion = 'foco',
  source: SourceSesion = 'bloque',
): Promise<{ id: number; startedAt: string }> {
  await cerrarSesion(teamId, userId);
  const [sesion] = await db
    .insert(teamTaskWorkSessions)
    .values({ teamId, taskId, userId, startedAt: new Date(), kind, source, context: 'produccion' })
    .returning({ id: teamTaskWorkSessions.id, startedAt: teamTaskWorkSessions.startedAt });
  return { id: sesion.id, startedAt: sesion.startedAt.toISOString() };
}

/**
 * Bloque que no cuelga de un pedido: el Focus comercial, el de supervisión y el
 * Modo Noelia. Misma regla de siempre —una sola sesión abierta por persona—,
 * así que arrancar un bloque comercial cierra el de producción que hubiera
 * quedado corriendo, que es exactamente lo que pasa en la realidad.
 */
export async function abrirSesionDeBloque(
  teamId: number,
  userId: number,
  context: ContextoSesion,
  opts: { kind?: KindSesion; chatId?: number | null } = {},
): Promise<{ id: number; startedAt: string }> {
  await cerrarSesion(teamId, userId);
  const [sesion] = await db
    .insert(teamTaskWorkSessions)
    .values({
      teamId,
      taskId: null,
      userId,
      startedAt: new Date(),
      kind: opts.kind ?? 'foco',
      source: 'bloque',
      context,
      chatId: opts.chatId ?? null,
    })
    .returning({ id: teamTaskWorkSessions.id, startedAt: teamTaskWorkSessions.startedAt });
  return { id: sesion.id, startedAt: sesion.startedAt.toISOString() };
}

/** La sesión que el usuario tiene abierta ahora mismo, sea del bloque que sea. */
export async function sesionAbierta(
  teamId: number,
  userId: number,
): Promise<{ id: number; startedAt: string; context: string; taskId: number | null; chatId: number | null; kind: string } | null> {
  const [fila] = await db
    .select({
      id: teamTaskWorkSessions.id,
      startedAt: teamTaskWorkSessions.startedAt,
      context: teamTaskWorkSessions.context,
      taskId: teamTaskWorkSessions.taskId,
      chatId: teamTaskWorkSessions.chatId,
      kind: teamTaskWorkSessions.kind,
    })
    .from(teamTaskWorkSessions)
    .where(and(eq(teamTaskWorkSessions.teamId, teamId), eq(teamTaskWorkSessions.userId, userId), isNull(teamTaskWorkSessions.endedAt)))
    .orderBy(desc(teamTaskWorkSessions.startedAt))
    .limit(1);
  return fila ? { ...fila, startedAt: fila.startedAt.toISOString() } : null;
}

/** Minutos de foco por contexto en una ventana. Es el insumo del tablero de cierre. */
export async function horasPorContexto(teamId: number, desde: Date): Promise<Record<string, number>> {
  const filas = await db
    .select({
      context: teamTaskWorkSessions.context,
      minutos: sql<number>`coalesce(sum(${teamTaskWorkSessions.minutes}), 0)::int`,
    })
    .from(teamTaskWorkSessions)
    .where(
      and(
        eq(teamTaskWorkSessions.teamId, teamId),
        eq(teamTaskWorkSessions.kind, 'foco'),
        gte(teamTaskWorkSessions.startedAt, desde),
      ),
    )
    // `group by 1` por posición: el CASE/parámetros del where hacen que drizzle
    // renumere la expresión y Postgres deje de reconocerla como la misma.
    .groupBy(sql`1`);
  const out: Record<string, number> = {};
  for (const fila of filas) out[fila.context] = fila.minutos;
  return out;
}

/**
 * Tiempo cargado a mano: «estuve dos horas con esto ayer». Se guarda como una
 * sesión ya cerrada que arrancó hace `minutes`, para que la suma no distinga
 * entre lo que midió el reloj y lo que declaró la persona; `source` sí lo dice.
 */
export async function registrarSesionManual(
  teamId: number,
  userId: number,
  taskId: number,
  minutes: number,
  note?: string,
): Promise<{ id: number; minutes: number }> {
  const minutos = Math.max(1, Math.round(minutes));
  const ahora = new Date();
  const [sesion] = await db
    .insert(teamTaskWorkSessions)
    .values({
      teamId,
      taskId,
      userId,
      startedAt: new Date(ahora.getTime() - minutos * 60_000),
      endedAt: ahora,
      minutes: minutos,
      kind: 'foco',
      source: 'manual',
      note: note?.trim().slice(0, 2000) || null,
    })
    .returning({ id: teamTaskWorkSessions.id });
  return { id: sesion.id, minutes: minutos };
}

/**
 * Horas por pedido, para muchos pedidos en una sola consulta: `loadProductionOs`
 * carga cientos de pedidos y no puede ir a la base una vez por cada uno.
 * Sólo cuenta `kind = 'foco'`: el descanso es descanso.
 */
export async function resumenHorasPorTarea(teamId: number, taskIds: number[]): Promise<Map<number, ResumenHoras>> {
  const out = new Map<number, ResumenHoras>();
  if (!taskIds.length) return out;
  const filas = await db
    .select({
      id: teamTaskWorkSessions.id,
      taskId: teamTaskWorkSessions.taskId,
      kind: teamTaskWorkSessions.kind,
      minutes: teamTaskWorkSessions.minutes,
      startedAt: teamTaskWorkSessions.startedAt,
      endedAt: teamTaskWorkSessions.endedAt,
    })
    .from(teamTaskWorkSessions)
    .where(and(eq(teamTaskWorkSessions.teamId, teamId), inArray(teamTaskWorkSessions.taskId, taskIds)));
  const ahora = new Date();
  for (const fila of filas) {
    // `task_id` es opcional desde que existen los bloques que no son de
    // producción; acá se piden por tarea, así que las libres no aparecen.
    if (fila.taskId == null) continue;
    const taskId = fila.taskId;
    const resumen = out.get(taskId) ?? { minutosFoco: 0, sesiones: 0, sesionAbierta: null };
    resumen.sesiones += 1;
    if (fila.kind === 'foco') {
      resumen.minutosFoco += fila.endedAt ? fila.minutes ?? minutosEntre(fila.startedAt, fila.endedAt) : minutosAcotados(fila.startedAt, ahora);
    }
    // Si hubiera más de una abierta (no debería), se muestra la más reciente.
    if (!fila.endedAt && (!resumen.sesionAbierta || fila.startedAt.toISOString() > resumen.sesionAbierta.startedAt)) {
      resumen.sesionAbierta = { id: fila.id, startedAt: fila.startedAt.toISOString() };
    }
    out.set(taskId, resumen);
  }
  return out;
}
