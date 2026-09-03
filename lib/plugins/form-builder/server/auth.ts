import 'server-only';

import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import type { MemberPermissions } from '@/lib/permissions';
import { FORM_BUILDER_PLUGIN_ID } from './schema';

export async function getFormBuilderRequestContext(requiredPermission: keyof Omit<MemberPermissions, 'chatVisibility'>) {
  const ctx = await getPluginRequestContext(requiredPermission);
  if (!ctx.ok) return ctx;

  const activePlugins = await resolveActivePluginsForTeam(ctx.team.id, ctx.user.id);
  const isActive = activePlugins.some((plugin) => plugin.pluginId === FORM_BUILDER_PLUGIN_ID);

  if (!isActive) {
    return { ok: false as const, status: 403, message: 'Form builder plugin disabled' };
  }

  return ctx;
}
