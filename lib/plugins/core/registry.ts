import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { pluginSystemStates, teamMemberPlugins, teamMembers, teamPlugins } from '@/lib/db/schema';
import type { AppPluginManifest, PluginNavItem } from './types';
import type { MemberPermissions } from '@/lib/permissions';
import { ensureSystemPluginStateForTeam } from './service';

type PluginManifestModule = { default: AppPluginManifest };
type PluginLoader = () => Promise<PluginManifestModule>;

const pluginLoaders: Record<string, PluginLoader> = {
  'ai-chat': () => import('@/lib/plugins/ai-chat/manifest'),
  notes: () => import('@/lib/plugins/notes/manifest'),
  calendar: () => import('@/lib/plugins/calendar/manifest'),
  marketplace: () => import('@/lib/plugins/marketplace/manifest'),
  radar: () => import('@/lib/plugins/radar/manifest'),
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

export async function resolveActivePluginsForTeam(teamId: number, userId?: number): Promise<TeamPluginResolution[]> {
  const manifests = await getRegisteredPlugins();

  await ensureSystemPluginStateForTeam(teamId);

  const [installed, systemDefaults, userOverrides] = await Promise.all([
    db.select().from(teamPlugins).where(eq(teamPlugins.teamId, teamId)),
    db.select().from(pluginSystemStates),
    userId
      ? db
          .select()
          .from(teamMemberPlugins)
          .where(and(eq(teamMemberPlugins.teamId, teamId), eq(teamMemberPlugins.userId, userId)))
      : Promise.resolve([] as Array<typeof teamMemberPlugins.$inferSelect>),
  ]);

  const teamStateMap = new Map(installed.map((row) => [row.pluginId, row]));
  const systemStateMap = new Map(systemDefaults.map((row) => [row.pluginId, row]));
  const userOverrideMap = new Map(userOverrides.map((row) => [row.pluginId, row]));

  return manifests
    .filter((manifest) => {
      if (manifest.activationMode === 'system') {
        return true;
      }

      if (manifest.activationMode === 'global') {
        const teamEnabled = teamStateMap.get(manifest.id)?.enabled;
        if (typeof teamEnabled === 'boolean') {
          return teamEnabled;
        }

        return systemStateMap.get(manifest.id)?.enabledByDefault === true;
      }

      if (manifest.activationMode === 'user') {
        return userOverrideMap.get(manifest.id)?.enabled === true;
      }

      const override = userOverrideMap.get(manifest.id);
      if (override) {
        return override.enabled;
      }

      const teamEnabled = teamStateMap.get(manifest.id)?.enabled;
      if (typeof teamEnabled === 'boolean') {
        return teamEnabled;
      }

      return systemStateMap.get(manifest.id)?.enabledByDefault === true;
    })
    .map((manifest) => {
      const row = teamStateMap.get(manifest.id);
      return {
        pluginId: manifest.id,
        enabled: true,
        installedAt: row?.installedAt ?? new Date(0),
        installedBy: row?.installedBy ?? null,
        settings: (row?.settings as Record<string, unknown>) ?? {},
        manifest,
      } satisfies TeamPluginResolution;
    });
}

const pluginPermissionMap: Record<string, keyof Omit<MemberPermissions, 'chatVisibility'>> = {
  'notes.read': 'notesRead',
  'notes.write': 'notesWrite',
  'calendar.read': 'calendarRead',
  'calendar.write': 'calendarWrite',
};

export async function resolveDashboardNavForTeam(teamId: number, userId?: number): Promise<PluginNavItem[]> {
  const activePlugins = await resolveActivePluginsForTeam(teamId, userId);
  let memberPermissions: MemberPermissions | null = null;
  let memberRole: string | null = null;

  if (userId) {
    const member = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      columns: {
        role: true,
        permissions: true,
      },
    });
    memberPermissions = (member?.permissions as MemberPermissions | null) ?? null;
    memberRole = member?.role ?? null;
  }

  return activePlugins
    .flatMap((plugin) => plugin.manifest.navItems)
    .filter((item) => item.href.startsWith('/'))
    .filter((item) => {
      if (!item.requiredPermission || !userId) return true;
      if (memberRole === 'owner' || memberRole === 'admin') return true;
      const permissionKey = pluginPermissionMap[item.requiredPermission];
      if (!permissionKey) return true;
      return memberPermissions?.[permissionKey] === true;
    })
    .sort((a, b) => a.order - b.order);
}
