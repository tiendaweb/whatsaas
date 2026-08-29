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
  domains: () => import('@/lib/plugins/domains/manifest'),
  articles: () => import('@/lib/plugins/articles/manifest'),
  sales: () => import('@/lib/plugins/sales/manifest'),
  deals: () => import('@/lib/plugins/deals/manifest'),
  'sales-ops': () => import('@/lib/plugins/sales-ops/manifest'),
  customers: () => import('@/lib/plugins/customers/manifest'),
  'aapp-space': () => import('@/lib/plugins/aapp-space/manifest'),
  memberships: () => import('@/lib/plugins/memberships/manifest'),
  tasks: () => import('@/lib/plugins/tasks/manifest'),
  'scheduled-messages': () => import('@/lib/plugins/scheduled-messages/manifest'),
  'mini-apps': () => import('@/lib/plugins/mini-apps/manifest'),
  'app-maker': () => import('@/lib/plugins/app-maker/manifest'),
  'social-publisher': () => import('@/lib/plugins/social-publisher/manifest'),
  'form-builder': () => import('@/lib/plugins/form-builder/manifest'),
  hostinger: () => import('@/lib/plugins/hostinger/manifest'),
  'meta-ads': () => import('@/lib/plugins/meta-ads/manifest'),
  documents: () => import('@/lib/plugins/documents/manifest'),
  files: () => import('@/lib/plugins/files/manifest'),
  sites: () => import('@/lib/plugins/sites/manifest'),
  'grok-connector': () => import('@/lib/plugins/grok-connector/manifest'),
  'claude-code-connector': () => import('@/lib/plugins/claude-code-connector/manifest'),
  'chatgpt-connector': () => import('@/lib/plugins/chatgpt-connector/manifest'),
  finance: () => import('@/lib/plugins/finance/manifest'),
  purchases: () => import('@/lib/plugins/purchases/manifest'),
  hr: () => import('@/lib/plugins/hr/manifest'),
  support: () => import('@/lib/plugins/support/manifest'),
  contracts: () => import('@/lib/plugins/contracts/manifest'),
  intelligence: () => import('@/lib/plugins/intelligence/manifest'),
  radar: () => import('@/lib/plugins/radar/manifest'),
  gemini: () => import('@/lib/plugins/gemini/manifest'),
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
  'domains.read': 'domainsRead',
  'domains.write': 'domainsWrite',
  'articles.read': 'articlesRead',
  'articles.write': 'articlesWrite',
  'sales.read': 'salesRead',
  'sales.write': 'salesWrite',
  // El banco de API keys es configuración de IA: quien administra el Agente
  // IA administra el banco. No hace falta un permiso propio.
  'gemini.manage': 'aiAgent',
  'deals.read': 'dealsRead',
  'deals.write': 'dealsWrite',
  'sales-ops.read': 'salesOpsRead',
  'sales-ops.write': 'salesOpsWrite',
  'customers.read': 'customersRead',
  'customers.write': 'customersWrite',
  'aapp-space.read': 'aappSpaceRead',
  'aapp-space.write': 'aappSpaceWrite',
  'memberships.read': 'membershipsRead',
  'memberships.write': 'membershipsWrite',
  'tasks.read': 'tasksRead',
  'tasks.write': 'tasksWrite',
  'scheduled-messages.read': 'scheduledMessagesRead',
  'scheduled-messages.write': 'scheduledMessagesWrite',
  'mini-apps.read': 'miniAppsRead',
  'mini-apps.write': 'miniAppsWrite',
  'app-maker.read': 'miniAppsRead',
  'app-maker.write': 'miniAppsWrite',
  'social-publisher.read': 'socialPublisherRead',
  'social-publisher.write': 'socialPublisherWrite',
  'form-builder.read': 'formBuilderRead',
  'form-builder.write': 'formBuilderWrite',
  'hostinger.read': 'hostingerRead',
  'hostinger.write': 'hostingerWrite',
  'meta-ads.read': 'metaAdsRead',
  'meta-ads.write': 'metaAdsWrite',
  'documents.read': 'documentsRead',
  'documents.write': 'documentsWrite',
  'files.read': 'filesRead',
  'sites.read': 'sitesRead',
  'sites.write': 'sitesWrite',
  'finance.read': 'financeRead',
  'finance.write': 'financeWrite',
  'purchases.read': 'purchasesRead',
  'purchases.write': 'purchasesWrite',
  'hr.read': 'hrRead',
  'hr.write': 'hrWrite',
  'support.read': 'supportRead',
  'support.write': 'supportWrite',
  'contracts.read': 'contractsRead',
  'contracts.write': 'contractsWrite',
  'intelligence.read': 'intelligenceRead',
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
    .filter((item) => !item.href.startsWith('/plugins/marketplace'))
    .filter((item) => {
      if (!item.requiredPermission || !userId) return true;
      if (memberRole === 'owner' || memberRole === 'admin') return true;
      const permissionKey = pluginPermissionMap[item.requiredPermission];
      if (!permissionKey) return true;
      return memberPermissions?.[permissionKey] === true;
    })
    .sort((a, b) => a.order - b.order);
}
