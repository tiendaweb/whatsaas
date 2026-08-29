import 'server-only';
import { z } from 'zod';
import { parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import {
  classifyIncomingMessage,
  listScanCandidates,
  listSignals,
  scanNewMessages,
} from '@/lib/plugins/sales-ops/server/radar';
import { GATES, SIGNAL_KINDS, SIGNAL_STATUSES } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * Radar de respuestas por MCP (`whatspro_sales_signals_list`, `whatspro_sales_signal_write`,
 * `whatspro_sales_radar_scan`).
 *
 * 🚨 `inputSchema` es JSON Schema puro: un `z.object` adentro hace desaparecer la
 * tool en silencio. Zod se usa sólo DENTRO del handler. Verificar con
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
 *
 * Toda la lógica vive en server/radar.ts con firma `(teamId, …)`: el mensaje se
 * busca siempre acotado a `context.teamId`, así que un id de otro equipo no
 * existe para estas tools.
 */

const listSchema = z.object({
  status: z.enum([...SIGNAL_STATUSES, 'all']).optional(),
  kind: z.enum(SIGNAL_KINDS).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const writeSchema = z.object({
  message_id: z.string().min(1).max(255),
  kind: z.enum(SIGNAL_KINDS),
  confidence: z.number().int().min(0).max(100),
  gate_after_suggested: z.enum(GATES).nullable().optional(),
  urgent: z.boolean().optional(),
  excerpt: z.string().max(300).optional(),
  dry_run: z.boolean().optional(),
});

const scanSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  dry_run: z.boolean().optional(),
});

export const signalReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_signals_list',
    description:
      'Radar de respuestas del Command Center Comercial: lista las señales (una por mensaje entrante ' +
      'clasificado) con tipo, confianza, extracto, gate antes/después y si respondió a un envío de la cola. ' +
      'Por defecto sólo las `new`. Incluye conteos por tipo y el último corte.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...SIGNAL_STATUSES, 'all'] },
        kind: { type: 'string', enum: [...SIGNAL_KINDS] },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
];

export const signalActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_signal_write',
    description:
      'Guarda la clasificación de UN mensaje entrante como señal del radar (idempotente por message_id). ' +
      'Las reglas del servidor (pago, rechazo, auto-reply, precio, llamada) mandan sobre la clasificación ' +
      'traída; el conector decide sólo lo ambiguo. Con dry_run devuelve lo que se guardaría sin escribir.',
    inputSchema: {
      type: 'object',
      required: ['message_id', 'kind', 'confidence'],
      properties: {
        message_id: { type: 'string', minLength: 1, maxLength: 255 },
        kind: { type: 'string', enum: [...SIGNAL_KINDS] },
        confidence: { type: 'integer', minimum: 0, maximum: 100 },
        gate_after_suggested: { type: ['string', 'null'], enum: [...GATES, null] },
        urgent: { type: 'boolean' },
        excerpt: { type: 'string', maxLength: 300, description: 'Fragmento literal que justifica la categoría.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_radar_scan',
    description:
      'Barre los mensajes entrantes nuevos desde el último corte del radar y los clasifica con las reglas del ' +
      'servidor (sin IA). Con dry_run devuelve los mensajes candidatos sin clasificar, para que el conector ' +
      'los clasifique y los guarde con whatspro_sales_signal_write.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 500 },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

export async function executeSignalTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  switch (name) {
    case 'whatspro_sales_signals_list': {
      const args = parse(listSchema, input);
      return listSignals(context.teamId, { status: args.status, kind: args.kind, limit: args.limit ?? 50 });
    }
    case 'whatspro_sales_signal_write': {
      const args = parse(writeSchema, input);
      const result = await classifyIncomingMessage(context.teamId, args.message_id, {
        engine: 'rules',
        connector: 'connector',
        dryRun: args.dry_run === true,
        classification: {
          kind: args.kind,
          confidence: args.confidence,
          gate_after_suggested: args.gate_after_suggested ?? null,
          urgent: args.urgent ?? false,
          excerpt: args.excerpt,
        },
      });
      if (!result.ok) throw new Error(result.reason);
      return { dry_run: args.dry_run === true, created: result.created, decided_by: result.decidedBy, reason: result.reason, signal: result.signal };
    }
    case 'whatspro_sales_radar_scan': {
      const args = parse(scanSchema, input);
      if (args.dry_run) {
        const { since, candidates } = await listScanCandidates(context.teamId, { limit: args.limit ?? 200 });
        return { dry_run: true, since: since.toISOString(), total: candidates.length, candidates };
      }
      return scanNewMessages(context.teamId, { limit: args.limit ?? 200, engine: 'rules' });
    }
    default:
      throw new Error(`sales-ops signal tools: tool desconocida ${name}`);
  }
}
