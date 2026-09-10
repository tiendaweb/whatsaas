import 'server-only';
import type { GrokActionContext, GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { comentariosActionTools, comentariosReadTools, executeComentariosTool } from '@/lib/plugins/marketing/tools/comentarios-tools';

/**
 * Marketing por MCP (`whatspro_social_comment*`).
 *
 * Agregador: la lógica vive en `lib/plugins/marketing/tools/comentarios-tools.ts`
 * y acá sólo se re-exporta para el registro de tools del conector, con el mismo
 * patrón que `production-actions.ts`.
 */
export { comentariosActionTools as marketingActionTools, comentariosReadTools as marketingReadTools };

const has = (tools: GrokActionTool[], name: string) => tools.some((tool) => tool.name === name);

export async function executeMarketingAction(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (has(comentariosReadTools, name) || has(comentariosActionTools, name)) return executeComentariosTool(name, input, context);
  throw new Error(`marketing: tool desconocida ${name}`);
}
