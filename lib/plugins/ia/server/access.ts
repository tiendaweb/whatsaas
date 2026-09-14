import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

/**
 * Contexto de una ruta HTTP del hub de IA.
 *
 * El hub no escribe: cada cosa se edita donde vive (el agente en Ajustes, las
 * funciones en su gestor, las keys en el banco). `iaWrite` existe en el mapa de
 * permisos para el día que alguna vista deje de ser de sólo lectura.
 */
export async function getIaContext() {
  return getPluginRequestContext('iaRead');
}
