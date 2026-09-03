/**
 * El mapa de permisos por recurso vive en `lib/readonly-api/resource-policies.ts`
 * y lo comparten App Maker y el conector MCP. Este archivo queda como el nombre
 * con el que App Maker ya lo llamaba, para no tocar sus tres consumidores.
 */
export {
  readOnlyResourcePolicy as appMakerResourcePolicy,
  type ReadOnlyResourcePolicy as AppMakerResourcePolicy,
} from '@/lib/readonly-api/resource-policies';
