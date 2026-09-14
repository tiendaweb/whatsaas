/**
 * Activa una app (por defecto Marketing) para un equipo: `PLUGIN_ID=... npx tsx …`.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/activar-marketing.mts
 *
 * Un plugin nuevo no aparece solo: hasta que no hay fila en `team_plugins` con
 * `installed` y `enabled`, el registro lo resuelve como apagado y ni el rail ni
 * el lanzador lo muestran.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';

const TEAM_ID = Number(process.env.CRM_TEAM_ID ?? 2);
const USER_ID = Number(process.env.CRM_USER_ID ?? 3);
const PLUGIN_ID = process.env.PLUGIN_ID ?? "marketing";

async function main() {
  const existente = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, TEAM_ID), eq(teamPlugins.pluginId, PLUGIN_ID)),
  });

  if (existente) {
    await db
      .update(teamPlugins)
      .set({ installed: true, enabled: true, updatedAt: new Date() })
      .where(and(eq(teamPlugins.teamId, TEAM_ID), eq(teamPlugins.pluginId, PLUGIN_ID)));
    console.log(`${PLUGIN_ID} ya existía para el equipo ${TEAM_ID}: queda instalada y encendida.`);
  } else {
    await db.insert(teamPlugins).values({
      teamId: TEAM_ID,
      pluginId: PLUGIN_ID,
      installed: true,
      enabled: true,
      settings: {},
      installedBy: USER_ID,
    });
    console.log(`${PLUGIN_ID} instalada y encendida para el equipo ${TEAM_ID}.`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
