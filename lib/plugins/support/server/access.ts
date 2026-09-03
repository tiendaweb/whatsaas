import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

export async function getSupportRequestContext(mode: 'read' | 'write') {
  const context = await getPluginRequestContext(mode === 'read' ? 'supportRead' : 'supportWrite');
  if (!context.ok) return context;

  const activePlugins = await resolveActivePluginsForTeam(context.team.id, context.user.id);
  if (!activePlugins.some((plugin) => plugin.pluginId === 'support')) {
    return { ok: false as const, status: 403, message: 'Support plugin is not enabled' };
  }

  return context;
}
