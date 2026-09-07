import 'server-only';
import type { GrokActionContext, GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { executeProductionTool, productionActionTools, productionReadTools } from '@/lib/plugins/tasks/tools/production-tools';

/**
 * Producción OS por MCP (`whatspro_production_*`).
 *
 * Agregador: la lógica vive en `lib/plugins/tasks/tools/production-tools.ts` y
 * acá sólo se re-exporta para el registro de tools del conector, con el mismo
 * patrón que `sales-ops-actions.ts`.
 */
export { productionActionTools, productionReadTools };

const has = (tools: GrokActionTool[], name: string) => tools.some((tool) => tool.name === name);

export async function executeProductionAction(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (has(productionReadTools, name) || has(productionActionTools, name)) return executeProductionTool(name, input, context);
  throw new Error(`produccion: tool desconocida ${name}`);
}
