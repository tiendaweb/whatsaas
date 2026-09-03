import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { teamRadarUserState } from '@/lib/db/schema';
import type { RadarUserState } from '@/lib/plugins/radar/shared/engine';

/**
 * Estado libre por usuario+app: tab elegida, filtros, snoozes, pins… Es un
 * bolsillo de la UI, no una fuente de verdad: perderlo molesta, no rompe.
 * `appSlug` vacío es el estado global de Radar, no atado a ninguna app.
 */

/** Techo del JSON serializado: esto es para preferencias, no para datasets. */
const MAX_STATE_BYTES = 32 * 1024;

/** La fila guarda jsonb libre: si alguien metió un array o un escalar, se lee como vacío. */
function toState(value: unknown): RadarUserState {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RadarUserState)
    : {};
}

export async function getRadarUserState(
  teamId: number,
  userId: number,
  appSlug?: string,
): Promise<RadarUserState> {
  const [row] = await db
    .select({ state: teamRadarUserState.state })
    .from(teamRadarUserState)
    .where(
      and(
        eq(teamRadarUserState.teamId, teamId),
        eq(teamRadarUserState.userId, userId),
        eq(teamRadarUserState.appSlug, appSlug ?? ''),
      ),
    )
    .limit(1);
  return row ? toState(row.state) : {};
}

/**
 * Merge SUPERFICIAL clave a clave: cada clave del patch pisa la guardada, un
 * valor `null` la BORRA, y las que no vinieron quedan como estaban. Con
 * `replace: true` el patch pasa a ser el estado entero (los `null` también se
 * descartan ahí: null nunca se persiste, significa "borrar").
 */
export async function setRadarUserState(args: {
  teamId: number;
  userId: number;
  appSlug?: string;
  patch: RadarUserState;
  replace?: boolean;
}): Promise<RadarUserState> {
  const appSlug = args.appSlug ?? '';
  const base = args.replace ? {} : await getRadarUserState(args.teamId, args.userId, appSlug);

  const next: RadarUserState = { ...base };
  for (const [key, value] of Object.entries(args.patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }

  const bytes = Buffer.byteLength(JSON.stringify(next), 'utf8');
  if (bytes > MAX_STATE_BYTES) {
    throw new Error(
      `El estado de usuario quedaría en ${Math.ceil(bytes / 1024)} KB y el máximo es 32 KB: esto es para preferencias de UI, no para guardar datos.`,
    );
  }

  const [row] = await db
    .insert(teamRadarUserState)
    .values({
      teamId: args.teamId,
      userId: args.userId,
      appSlug,
      state: next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [teamRadarUserState.teamId, teamRadarUserState.userId, teamRadarUserState.appSlug],
      set: { state: next, updatedAt: new Date() },
    })
    .returning({ state: teamRadarUserState.state });

  return toState(row.state);
}
