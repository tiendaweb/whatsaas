import 'server-only';
import { z } from 'zod';
import { parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { listWorkQueue, WORK_KINDS } from '@/lib/plugins/sales-ops/server/work-queue';

export const workReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_work_queue',
    description:
      'Cola de trabajo del Command Center Comercial para conectores: devuelve, ordenado por prioridad, todo lo que el servidor NO puede hacer solo y espera que lo haga una IA con conector. Cuatro tipos: execute_action (envíos/tareas/ventas YA APROBADAS por una persona, con el texto final, el chat_id y la idempotency_key a usar), classify (chats sin clasificar o desactualizados, primero los del prefiltro de dinero), classify_signal (respuestas nuevas de clientes sin señal) y transcribe (audios sin ficha de esos chats). Cada ítem trae "tools" y "steps": la cadena exacta de herramientas whatspro_* para resolverlo y devolver el resultado (whatspro_sales_classification_write, whatspro_sales_queue_result, whatspro_sales_signal_write, whatspro_audio_insight_write). Reglas: no tocar el CRM; un envío por llamada con la idempotency_key del ítem; antes de un envío aprobado verificar que el cliente no haya escrito después de la aprobación. Volvé a pedirla cuando termines el lote: se recalcula sola. No escribe nada. NOTA: si querés ver TODO el trabajo pendiente del equipo —esta cola más los prompts de Tareas y la bandeja del Centro de comandos— usá whatspro_work_queue, que las federa en una sola lista ordenada por prioridad. Esta tool sigue sirviendo para trabajar sólo lo comercial.',
    inputSchema: {
      type: 'object',
      properties: {
        kinds: { type: 'array', items: { type: 'string', enum: [...WORK_KINDS] }, description: 'Filtrar por tipo de trabajo. Vacío = todos.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Máximo de ítems (default 30).' },
      },
      additionalProperties: false,
    },
  },
];

export const workActionTools: GrokActionTool[] = [];

const schema = z.object({
  kinds: z.array(z.enum(WORK_KINDS as [string, ...string[]])).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function executeWorkTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name !== 'whatspro_sales_work_queue') throw new Error(`sales-ops work: tool desconocida ${name}`);
  const args = parse(schema, input);
  return listWorkQueue(context.teamId, { kinds: args.kinds as never, limit: args.limit });
}
