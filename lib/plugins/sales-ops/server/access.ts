import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

/** Contexto de una ruta HTTP del plugin. `salesOpsWrite` sólo para aprobar/ejecutar/override. */
export async function getSalesOpsContext(permission: 'salesOpsRead' | 'salesOpsWrite' = 'salesOpsRead') {
  return getPluginRequestContext(permission);
}
