import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

/**
 * Contexto de una ruta HTTP de Empresa.
 *
 * Empresa casi no escribe: lo que se edita se edita en la app dueña del dato
 * (planes en Membresías, ventas en Ventas). La excepción es Proyectos, que
 * dejó de ser una pantalla de sólo mirar —se crean proyectos, se editan tareas
 * y se marcan checklists sin salir a Tareas OS—, y usa `empresaWrite`, el
 * permiso que estaba reservado en el mapa justamente para este día.
 */
export async function getEmpresaContext() {
  return getPluginRequestContext('empresaRead');
}

/** Contexto de las rutas de Empresa que modifican datos. */
export async function getEmpresaWriteContext() {
  return getPluginRequestContext('empresaWrite');
}
