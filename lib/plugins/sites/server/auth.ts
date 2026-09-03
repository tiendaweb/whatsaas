import 'server-only';

import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import type { MemberPermissions } from '@/lib/permissions';
import { SITES_PLUGIN_ID } from './constants';

export async function getSitesRequestContext(
  requiredPermission: keyof Omit<MemberPermissions, 'chatVisibility'>,
) {
  const ctx = await getPluginRequestContext(requiredPermission);
  if (!ctx.ok) return ctx;

  const activePlugins = await resolveActivePluginsForTeam(ctx.team.id, ctx.user.id);
  if (!activePlugins.some((plugin) => plugin.pluginId === SITES_PLUGIN_ID)) {
    return { ok: false as const, status: 403, message: 'Sites plugin disabled' };
  }

  return ctx;
}
