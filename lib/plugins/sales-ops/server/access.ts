import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { hasPermission } from '@/lib/permissions';

/** Contexto de una ruta HTTP del plugin. `salesOpsWrite` sólo para aprobar/ejecutar/override. */
export async function getSalesOpsContext(permission: 'salesOpsRead' | 'salesOpsWrite' = 'salesOpsRead') {
  return getPluginRequestContext(permission);
}

/** Producción se muestra en el Command Center, pero escribe la fuente Tareas. */
export async function getSalesOpsTasksContext(mode: 'read' | 'write') {
  const ctx = await getSalesOpsContext(mode === 'write' ? 'salesOpsWrite' : 'salesOpsRead');
  if (!ctx.ok) return ctx;
  const permission = mode === 'write' ? 'tasksWrite' : 'tasksRead';
  if (!hasPermission(ctx.membership.role, ctx.membership.permissions, permission)) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }
  return ctx;
}
