import 'server-only';

import { executeRadarQuery } from '@/lib/plugins/radar/server/engine/data';
import type { BwSystemBinding } from '../shared/schema';

/**
 * Puente hacia el motor de datos de Radar Engine para bindings `kind:
 * "system"`. NO hay una capa nueva de acceso a datos acá — se reusa
 * `executeRadarQuery` tal cual (SQL parametrizado contra una whitelist de
 * campos por source, SIEMPRE filtrado por `teamId`). Este archivo sólo
 * traduce la forma del binding del tema al `RadarQuery` que esa función
 * espera.
 */
export async function resolveBwSystemBinding(teamId: number, binding: BwSystemBinding) {
  return executeRadarQuery(teamId, {
    source: binding.source,
    where: binding.where,
    sort: binding.sort,
    select: binding.select,
    limit: binding.limit,
  });
}
