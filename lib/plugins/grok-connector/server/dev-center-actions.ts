import 'server-only';
import type { GrokActionContext, GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { devCenterActionTools, devCenterReadTools, executeDevCenterTool } from '@/lib/plugins/dev-center/tools/dev-center-tools';

/**
 * Centro de Desarrollo por MCP (`whatspro_dev_*`).
 *
 * Agregador: la lógica vive en `lib/plugins/dev-center/tools/dev-center-tools.ts`
 * y acá sólo se re-exporta para el registro de tools del conector, con el
 * mismo patrón que `production-actions.ts`.
 */
export { devCenterActionTools, devCenterReadTools };

const has = (tools: GrokActionTool[], name: string) => tools.some((tool) => tool.name === name);

export async function executeDevCenterAction(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (has(devCenterReadTools, name) || has(devCenterActionTools, name)) return executeDevCenterTool(name, input, context);
  throw new Error(`dev-center: tool desconocida ${name}`);
}
