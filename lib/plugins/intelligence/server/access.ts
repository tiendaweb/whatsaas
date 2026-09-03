import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

export async function getIntelligenceRequestContext() {
  const context = await getPluginRequestContext('intelligenceRead');
  if (!context.ok) return context;

  const activePlugins = await resolveActivePluginsForTeam(context.team.id, context.user.id);
  if (!activePlugins.some((plugin) => plugin.pluginId === 'intelligence')) {
    return { ok: false as const, status: 403, message: 'Intelligence plugin is not enabled' };
  }

  return { ...context, activePluginIds: new Set(activePlugins.map((plugin) => plugin.pluginId)) };
}
