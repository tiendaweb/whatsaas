import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export async function getAappRenewalRequestContext(mode: 'read' | 'write') {
  const scheduledPermission = mode === 'read' ? 'scheduledMessagesRead' : 'scheduledMessagesWrite';
  const aappPermission = mode === 'read' ? 'aappSpaceRead' : 'aappSpaceWrite';
  const context = await getPluginRequestContext(scheduledPermission);
  if (!context.ok) return context;
  if (
    context.membership.role !== 'owner'
    && context.membership.role !== 'admin'
    && context.membership.permissions?.[aappPermission] !== true
  ) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }
  return context;
}
