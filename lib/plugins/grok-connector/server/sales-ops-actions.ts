import 'server-only';
import type { GrokActionContext, GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { dossierActionTools, dossierReadTools, executeDossierTool } from '@/lib/plugins/sales-ops/tools/dossier-tools';
import { executeQueueTool, queueActionTools, queueReadTools } from '@/lib/plugins/sales-ops/tools/queue-tools';
import { executeSignalTool, signalActionTools, signalReadTools } from '@/lib/plugins/sales-ops/tools/signal-tools';
import { executeWorkTool, workActionTools, workReadTools } from '@/lib/plugins/sales-ops/tools/work-tools';

/**
 * Command Center Comercial por MCP (`whatspro_sales_*`).
 *
 * Agregador: cada dominio vive en `lib/plugins/sales-ops/tools/*` y acá sólo se
 * concatena y despacha por nombre. 🚨 `inputSchema` es JSON Schema puro: un
 * `z.object` adentro hace desaparecer la tool en silencio (verificar con
 * scripts/verify-connector-tools.mts).
 */
export const salesOpsReadTools: GrokActionTool[] = [...workReadTools, ...dossierReadTools, ...queueReadTools, ...signalReadTools];
export const salesOpsActionTools: GrokActionTool[] = [...dossierActionTools, ...queueActionTools, ...signalActionTools, ...workActionTools];

const has = (tools: GrokActionTool[], name: string) => tools.some((tool) => tool.name === name);

export async function executeSalesOpsTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (has(workReadTools, name) || has(workActionTools, name)) return executeWorkTool(name, input, context);
  if (has(dossierReadTools, name) || has(dossierActionTools, name)) return executeDossierTool(name, input, context);
  if (has(queueReadTools, name) || has(queueActionTools, name)) return executeQueueTool(name, input, context);
  if (has(signalReadTools, name) || has(signalActionTools, name)) return executeSignalTool(name, input, context);
  throw new Error(`sales-ops: tool desconocida ${name}`);
}
