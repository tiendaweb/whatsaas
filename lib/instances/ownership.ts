import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { evolutionInstances } from '@/lib/db/schema';

/**
 * Propiedad de una instancia de WhatsApp.
 *
 * Había un agujero repetido en cuatro lugares: se aceptaba un `instanceId` del
 * body sin comprobar de quién era, se guardaba en una fila propia, y más tarde
 * otro proceso cargaba la instancia **por id solo** para sacarle el
 * `accessToken` y mandar. Resultado: un equipo enviando WhatsApps desde el
 * número de otro, con el token de otro, y con el gasto cayéndole al otro.
 *
 * Los ids son enteros secuenciales, así que enumerarlos es trivial.
 *
 * La regla: una instancia que llega de afuera se valida contra el equipo ANTES
 * de guardarla, y el consumidor vuelve a filtrar por equipo antes de usar el
 * token. Las dos cosas, porque en la base ya pueden existir filas envenenadas
 * de antes de este arreglo.
 */

export class InstanceOwnershipError extends Error {}

/** La instancia si es de este equipo, o `null`. No lanza. */
export async function findTeamInstance(teamId: number, instanceId: number | null | undefined) {
  if (instanceId == null || !Number.isInteger(instanceId) || instanceId <= 0) return null;
  const [instance] = await db
    .select()
    .from(evolutionInstances)
    .where(and(eq(evolutionInstances.id, instanceId), eq(evolutionInstances.teamId, teamId)))
    .limit(1);
  return instance ?? null;
}

/** Igual, pero lanza. Para usar en el borde de entrada de una route. */
export async function assertTeamInstance(teamId: number, instanceId: number) {
  const instance = await findTeamInstance(teamId, instanceId);
  if (!instance) {
    throw new InstanceOwnershipError('La instancia de WhatsApp no existe o no es de este equipo.');
  }
  return instance;
}

/**
 * Valida el id que vino de afuera; si no vino ninguno, cae en la instancia del
 * equipo. Devuelve el id a guardar.
 *
 * Es el reemplazo directo del patrón `instanceId = body.instanceId ?? null`,
 * que era justamente el que dejaba pasar el id ajeno.
 */
export async function resolveOwnedInstanceId(
  teamId: number,
  instanceId: number | null | undefined,
): Promise<number | null> {
  if (instanceId == null) {
    const [fallback] = await db
      .select({ id: evolutionInstances.id })
      .from(evolutionInstances)
      .where(eq(evolutionInstances.teamId, teamId))
      .orderBy(asc(evolutionInstances.id))
      .limit(1);
    return fallback?.id ?? null;
  }
  const instance = await assertTeamInstance(teamId, instanceId);
  return instance.id;
}
