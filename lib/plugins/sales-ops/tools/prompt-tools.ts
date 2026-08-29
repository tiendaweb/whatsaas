import 'server-only';
import { z } from 'zod';
import { parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { completePromptRun, listPromptRuns, listQuickActions, PROMPT_RUN_STATUSES } from '@/lib/plugins/sales-ops/server/prompt-queue';

export const promptReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_prompts_list',
    description:
      'Prompt Studio del Command Center Comercial: lista las acciones rápidas guardadas por el equipo (prompts versionados con su texto completo y la cadena de tools sugerida) y, si se pide, las corridas encoladas/en curso que esperan un conector. Usala para saber qué prompts existen antes de improvisar uno, o para ver qué te dejaron encolado desde la interfaz (botones del Prompt Studio o "Siguiente acción" de una ficha). No escribe nada.',
    inputSchema: {
      type: 'object',
      properties: {
        include_runs: { type: 'boolean', description: 'true = incluir también las corridas con status queued/in_progress.' },
        chat_id: { type: 'integer', minimum: 1, description: 'Filtrar corridas por chat.' },
      },
      additionalProperties: false,
    },
  },
];

export const promptActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_prompt_result',
    description:
      'Cierra (o marca en curso) una corrida de prompt del Prompt Studio que un conector tomó de whatspro_sales_work_queue (ítems kind=run_prompt). status: in_progress (la tomaste), completed (hecha; contá en summary qué hiciste en 1-3 líneas), failed (no se pudo; motivo en summary), blocked (falta algo de una persona; qué falta en summary). Es la única forma de que la interfaz sepa que el prompt se ejecutó: sin esto queda encolado para siempre. No toca el CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: ['in_progress', 'completed', 'failed', 'blocked'] },
        summary: { type: 'string', maxLength: 4000, description: 'Qué se hizo o por qué no.' },
        connector: { type: 'string', enum: ['claude', 'chatgpt', 'grok'], description: 'Quién ejecutó.' },
        dry_run: { type: 'boolean' },
      },
      required: ['run_id', 'status'],
      additionalProperties: false,
    },
  },
];

const listSchema = z.object({ include_runs: z.boolean().optional(), chat_id: z.number().int().positive().optional() });
const resultSchema = z.object({
  run_id: z.number().int().positive(),
  status: z.enum(['in_progress', 'completed', 'failed', 'blocked']),
  summary: z.string().max(4000).optional(),
  connector: z.enum(['claude', 'chatgpt', 'grok']).optional(),
  dry_run: z.boolean().optional(),
});

export async function executePromptTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_sales_prompts_list') {
    const args = parse(listSchema, input);
    const prompts = await listQuickActions(context.teamId);
    const runs = args.include_runs || args.chat_id ? await listPromptRuns(context.teamId, { status: 'open', chatId: args.chat_id, limit: 100 }) : [];
    return { prompts, runs, statuses: PROMPT_RUN_STATUSES };
  }
  if (name === 'whatspro_sales_prompt_result') {
    const args = parse(resultSchema, input);
    if (args.dry_run) return { dryRun: true, runId: args.run_id, status: args.status };
    return completePromptRun(context.teamId, context.userId ?? null, args.run_id, {
      status: args.status,
      summary: args.summary ?? null,
      connector: args.connector ?? 'connector',
    });
  }
  throw new Error(`sales-ops prompts: tool desconocida ${name}`);
}
