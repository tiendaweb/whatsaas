import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import { getRegisteredPluginById, getRegisteredPlugins } from './registry';

export async function listPluginsForTeam(teamId: number) {
  const availablePlugins = await getRegisteredPlugins();
  let installedPlugins: Array<typeof teamPlugins.$inferSelect> = [];

  try {
    installedPlugins = await db.select().from(teamPlugins).where(eq(teamPlugins.teamId, teamId));
  } catch (error) {
    throw new Error(
      `No se pudo leer la configuración de plugins para el equipo ${teamId}. Verifica migraciones de base de datos (team_plugins).`,
      { cause: error },
    );
  }

  const installedMap = new Map(installedPlugins.map((plugin) => [plugin.pluginId, plugin]));

  return availablePlugins.map((manifest) => {
    const installed = installedMap.get(manifest.id);

    return {
      manifest,
      state: {
        installed: installed?.installed ?? false,
        enabled: installed?.enabled ?? false,
        settings: (installed?.settings as Record<string, unknown>) ?? {},
      },
    };
  });
}

export async function saveTeamPluginState(input: {
  teamId: number;
  pluginId: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  actorUserId?: number;
}) {
  const manifest = await getRegisteredPluginById(input.pluginId);
  if (!manifest) {
    throw new Error('Plugin no encontrado en el registry.');
  }

  const parsedSettings = manifest.settingsSchema.safeParse(input.settings ?? {});
  if (!parsedSettings.success) {
    throw new Error(`Configuración inválida: ${parsedSettings.error.issues.map((i) => i.message).join(', ')}`);
  }

  const existing = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, input.teamId), eq(teamPlugins.pluginId, input.pluginId)),
  });

  const nextSettings = parsedSettings.data as Record<string, unknown>;

  if (!existing) {
    if (input.enabled && manifest.install) {
      await manifest.install({
        teamId: input.teamId,
        actorUserId: input.actorUserId,
        settings: nextSettings,
      });
    }

    await db.insert(teamPlugins).values({
      teamId: input.teamId,
      pluginId: input.pluginId,
      installed: input.enabled,
      enabled: input.enabled,
      settings: nextSettings,
      installedBy: input.actorUserId ?? null,
      installedAt: new Date(),
      updatedAt: new Date(),
    });

    return;
  }

  if (input.enabled && !existing.enabled && manifest.install) {
    await manifest.install({
      teamId: input.teamId,
      actorUserId: input.actorUserId,
      settings: nextSettings,
    });
  }

  if (!input.enabled && existing.enabled && manifest.uninstall) {
    await manifest.uninstall({
      teamId: input.teamId,
      actorUserId: input.actorUserId,
      settings: nextSettings,
    });
  }

  await db
    .update(teamPlugins)
    .set({
      enabled: input.enabled,
      installed: input.enabled ? true : existing.installed,
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(and(eq(teamPlugins.teamId, input.teamId), eq(teamPlugins.pluginId, input.pluginId)));
}
