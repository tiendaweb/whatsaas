import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

export async function getContractsRequestContext(mode: 'read' | 'write') {
  const context = await getPluginRequestContext(mode === 'read' ? 'contractsRead' : 'contractsWrite');
  if (!context.ok) return context;

  const activePlugins = await resolveActivePluginsForTeam(context.team.id, context.user.id);
  if (!activePlugins.some((plugin) => plugin.pluginId === 'contracts')) {
    return { ok: false as const, status: 403, message: 'Contracts plugin is not enabled' };
  }

  return context;
}
