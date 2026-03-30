import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import type { AppPluginManifest, PluginNavItem } from './types';

type PluginManifestModule = { default: AppPluginManifest };
type PluginLoader = () => Promise<PluginManifestModule>;

const pluginLoaders: Record<string, PluginLoader> = {
  'ai-chat': () => import('@/lib/plugins/ai-chat/manifest'),
};

const manifestCache = new Map<string, AppPluginManifest>();

export async function getRegisteredPlugins(): Promise<AppPluginManifest[]> {
  const loaded = await Promise.all(
    Object.entries(pluginLoaders).map(async ([id, load]) => {
      if (manifestCache.has(id)) {
        return manifestCache.get(id)!;
      }

      const module = await load();
      manifestCache.set(id, module.default);
      return module.default;
    }),
  );

  return loaded;
}

export async function getRegisteredPluginById(pluginId: string): Promise<AppPluginManifest | null> {
  const plugins = await getRegisteredPlugins();
  return plugins.find((plugin) => plugin.id === pluginId) ?? null;
}

export type TeamPluginResolution = {
  pluginId: string;
  enabled: boolean;
  installedAt: Date;
  installedBy: number | null;
  settings: Record<string, unknown>;
  manifest: AppPluginManifest;
};

export async function resolveActivePluginsForTeam(teamId: number): Promise<TeamPluginResolution[]> {
  const [manifests, installed] = await Promise.all([
    getRegisteredPlugins(),
    db
      .select()
      .from(teamPlugins)
      .where(and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.installed, true), eq(teamPlugins.enabled, true))),
  ]);

  const manifestMap = new Map(manifests.map((item) => [item.id, item]));

  return installed
    .map((row) => {
      const manifest = manifestMap.get(row.pluginId);
      if (!manifest) return null;

      return {
        pluginId: row.pluginId,
        enabled: row.enabled,
        installedAt: row.installedAt,
        installedBy: row.installedBy,
        settings: (row.settings as Record<string, unknown>) ?? {},
        manifest,
      } satisfies TeamPluginResolution;
    })
    .filter((item): item is TeamPluginResolution => item !== null);
}

export async function resolveDashboardNavForTeam(teamId: number): Promise<PluginNavItem[]> {
  const activePlugins = await resolveActivePluginsForTeam(teamId);

  return activePlugins
    .flatMap((plugin) => plugin.manifest.navItems)
    .filter((item) => item.href.startsWith('/'))
    .sort((a, b) => a.order - b.order);
}
