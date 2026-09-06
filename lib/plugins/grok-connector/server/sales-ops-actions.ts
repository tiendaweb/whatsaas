import 'server-only';
import type { GrokActionContext, GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { dossierActionTools, dossierReadTools, executeDossierTool } from '@/lib/plugins/sales-ops/tools/dossier-tools';
import { executeQueueTool, queueActionTools, queueReadTools } from '@/lib/plugins/sales-ops/tools/queue-tools';
import { executeSignalTool, signalActionTools, signalReadTools } from '@/lib/plugins/sales-ops/tools/signal-tools';
import { executeWorkTool, workActionTools, workReadTools } from '@/lib/plugins/sales-ops/tools/work-tools';
import { executePromptTool, promptActionTools, promptReadTools } from '@/lib/plugins/sales-ops/tools/prompt-tools';
import { executeTareasTool, tareasActionTools, tareasReadTools } from '@/lib/plugins/sales-ops/tools/tareas-tools';
import { executeManageTool, manageActionTools, manageReadTools } from '@/lib/plugins/sales-ops/tools/manage-tools';
import { cobrosActionTools, cobrosReadTools, executeCobrosTool } from '@/lib/plugins/sales-ops/tools/cobros-tools';

/**
 * Command Center Comercial por MCP (`whatspro_sales_*`).
 *
 * Agregador: cada dominio vive en `lib/plugins/sales-ops/tools/*` y acá sólo se
 * concatena y despacha por nombre. 🚨 `inputSchema` es JSON Schema puro: un
 * `z.object` adentro hace desaparecer la tool en silencio (verificar con
 * scripts/verify-connector-tools.mts).
 */
export const salesOpsReadTools: GrokActionTool[] = [...workReadTools, ...promptReadTools, ...dossierReadTools, ...queueReadTools, ...signalReadTools, ...manageReadTools, ...cobrosReadTools, ...tareasReadTools];
export const salesOpsActionTools: GrokActionTool[] = [...dossierActionTools, ...queueActionTools, ...signalActionTools, ...workActionTools, ...promptActionTools, ...tareasActionTools, ...manageActionTools, ...cobrosActionTools];

const has = (tools: GrokActionTool[], name: string) => tools.some((tool) => tool.name === name);

export async function executeSalesOpsTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (has(promptReadTools, name) || has(promptActionTools, name)) return executePromptTool(name, input, context);
  if (has(workReadTools, name) || has(workActionTools, name)) return executeWorkTool(name, input, context);
  if (has(dossierReadTools, name) || has(dossierActionTools, name)) return executeDossierTool(name, input, context);
  if (has(queueReadTools, name) || has(queueActionTools, name)) return executeQueueTool(name, input, context);
  if (has(signalReadTools, name) || has(signalActionTools, name)) return executeSignalTool(name, input, context);
  if (has(tareasReadTools, name)) return executeTareasTool(name, input, context);
  if (has(tareasActionTools, name)) return executeTareasTool(name, input, context);
  if (has(manageReadTools, name) || has(manageActionTools, name)) return executeManageTool(name, input, context);
  if (has(cobrosReadTools, name) || has(cobrosActionTools, name)) return executeCobrosTool(name, input, context);
  throw new Error(`sales-ops: tool desconocida ${name}`);
}
