import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

export async function getPurchasesRequestContext(mode: 'read' | 'write') {
  const context = await getPluginRequestContext(mode === 'read' ? 'purchasesRead' : 'purchasesWrite');
  if (!context.ok) return context;

  const activePlugins = await resolveActivePluginsForTeam(context.team.id, context.user.id);
  if (!activePlugins.some((plugin) => plugin.pluginId === 'purchases')) {
    return { ok: false as const, status: 403, message: 'Purchases plugin is not enabled' };
  }

  return context;
}
