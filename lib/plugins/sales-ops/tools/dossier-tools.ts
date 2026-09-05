import 'server-only';

import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { ClassificationInputError, classifyChat, listPendingChats } from '@/lib/plugins/sales-ops/server/classifier';
import { DossierError, buildChatDossier } from '@/lib/plugins/sales-ops/server/dossier';
import { getActivePrompt, SALES_OPS_PROMPT_KEYS } from '@/lib/plugins/sales-ops/server/prompts';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * Expediente y clasificación por MCP (`whatspro_sales_*`, doc 07 "Tools nuevas").
 *
 * 🚨 `inputSchema` es JSON Schema PURO: un `z.object` adentro hace desaparecer
 * la tool en silencio. Zod se usa sólo DENTRO del handler. Verificar con
 * `NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts`.
 *
 * Ninguna de estas tools escribe en el CRM: sólo en team_commercial_* y
 * team_prompt_runs. El teléfono nunca sale completo (`phoneMasked`). El chat
 * se valida contra `context.teamId` en el servidor (dossier/classifier).
 */

const CONNECTORS = ['claude', 'chatgpt', 'grok'] as const;

export const dossierReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_pending',
    description:
      'Command Center Comercial · P1 prefiltro de dinero. Lista los chats que todavía necesitan clasificación, ' +
      'ordenados como dice el doc 07: primero los que tienen un mensaje NUESTRO con datos de pago (alias/CBU/CVU/' +
      'transferencia/comprobante/seña/anticipo), después por fecha del último mensaje del cliente desc. ' +
      'source="prefiltro" (default) cruza cinco señales: pago_nuestro, radar_P1 (customData.radar_prioridad=P1), ' +
      'deal (oportunidad abierta), tag_producto (etiqueta "Membresía anual"/"A medida" sin cliente vinculado) y ' +
      'cliente_custom (customData.cliente=true sin vínculo a cliente). source="stale" devuelve los que ya tienen ' +
      'análisis pero el chat cambió (huella distinta) o quedaron marcados stale. source="all" devuelve los que ' +
      'nunca se analizaron (incluye las filas importadas del Radar, versión 0). Cada fila trae chat_id, contact_id, ' +
      'nombre, teléfono enmascarado, señales, último mensaje del cliente, quién habló último, automatización activa, ' +
      'audios sin ficha y el estado del análisis vigente. Excluye grupos. No escribe nada. ' +
      'Flujo típico: whatspro_sales_pending → whatspro_sales_dossier {chat_id} → razonar → whatspro_sales_classification_write.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['prefiltro', 'stale', 'all'], description: 'Qué cola listar. Default prefiltro.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Máximo de chats. Default 50.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_dossier',
    description:
      'Command Center Comercial · P2 expediente de UN chat (reemplaza la cadena de 6 tools del doc 07). Devuelve el ' +
      'Dossier normalizado: chat (nombre, teléfono enmascarado, contacto), contact (etapa, etiquetas, customData con ' +
      'rubro/tipo_servicio/origen_lead/cliente/radar_*), commercial (cliente vinculado, oportunidades, plata adeudada/' +
      'cobrada por moneda, suscripciones), counts (mensajes por quién: cliente/humano/bot/ia/nota, audios totales y ' +
      'transcriptos), timeline recortado (primeros 15 + últimos 60 + todos los que tengan flags precio/pago/objecion/' +
      'compromiso/rechazo/auto + todas las notas internas; el resto se resume en `omitted`), y `facts` = RuleFacts ' +
      'R1–R11 ya calculados por el servidor: cliente existente y su evidencia, forced_gate/min_gate, pago pendiente, ' +
      'automatización activa, auto-reply del cliente, hueco de evidencia (ids de audios sin ficha), nunca contestado, ' +
      'días de silencio, impactos (followups), origen inferido y fechas clave. Los audios con ficha vienen con su ' +
      'transcripción; los que no, como "[audio Ns sin transcribir]" (encolalos con whatspro_audio_queue_add si son ' +
      'recientes). `fingerprint` identifica el estado del chat: se guarda con la clasificación para detectar stale. ' +
      'Los grupos no tienen expediente. Sólo lectura.',
    inputSchema: {
      type: 'object',
      required: ['chat_id'],
      properties: { chat_id: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
  },
];

export const dossierActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_classification_write',
    description:
      'Command Center Comercial · guarda la clasificación de UN chat que razonaste vos (motor "connector"). ' +
      '`classification` es el JSON del contrato classificationSchema (doc 04 §7): current_gate/max_gate/drop_gate ' +
      '(G0..G11|GX), drop_reason (catálogo doc 03), confidence 0-100, evidence {gate:[msgIds], price, objection, ' +
      'intent, payment}, need, need_detail, quoted_price {amount, currency ARS|PYG|USD}|null, proposal_summary, ' +
      'objection_type, objection_detail, intent, intent_score, temperature, is_existing_customer_by_chat, ' +
      'payment_pending_by_chat, last_prospect_action, last_team_action, collection_speed, recommended_action ' +
      '(imperativa ≤200), recommended_owner (noelia|carlos|produccion|ia|nadie), suggested_status, next_action_at ' +
      '(YYYY-MM-DD|null), notes_for_human, crm_to_fix. El servidor valida con Zod y RECONCILIA con las reglas: R1 ' +
      'fuerte (cliente vinculado / venta pagada / suscripción) fuerza G11; R2/R3/R4 fuerzan G0/GX; R5 (pago ' +
      'pendiente) sube el mínimo a G9; confianza < 55 o evidence.gate vacío deja el estado en "en_proceso" ' +
      '(Revisar); descarte_definitivo queda pre_descarte hasta que lo apruebe una persona; un override humano ' +
      'vigente conserva su gate. Después calcula valor USD (quoted_price con fx del plugin, o tabla por necesidad), ' +
      'prioridad, y guarda una versión nueva con snapshot y diff (reason initial|chat_changed|prompt_changed). ' +
      'Devuelve gate final, estado, prioridad, versión, advertencias y el diff. Con dry_run=true muestra el resultado ' +
      'reconciliado sin guardar. Esta tool no escribe el CRM por su cuenta: lo que haya que corregir va en crm_to_fix ' +
      '(el texto que explica qué está mal) y en crm_fix (la corrección accionable: {stage?, add_tags?, remove_tags?, ' +
      'fields?, reason?}, por NOMBRE y no por id). Con crm_fix la ficha muestra un botón "Aplicar" que lo ejecuta. ' +
      'Si además querés dejarlo corregido vos mismo, usá whatspro_change_crm_stage / whatspro_set_contact_tags / ' +
      'whatspro_set_custom_fields sobre ESTE contacto: de a uno, sólo lo que contradice el chat, nunca en lote.',
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'classification', 'connector'],
      properties: {
        chat_id: { type: 'integer', minimum: 1 },
        classification: { type: 'object', description: 'JSON del contrato classificationSchema (doc 04 §7).' },
        connector: { type: 'string', enum: [...CONNECTORS], description: 'Quién razonó: claude, chatgpt o grok.' },
        prompt_version: { type: ['integer', 'null'], minimum: 0, description: 'Versión del prompt sales-ops.classify que usaste, si la sabés.' },
        dry_run: { type: 'boolean', description: 'true = reconciliar y devolver sin guardar.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_classify_server',
    description:
      'Command Center Comercial · fuerza la clasificación de UN chat con el motor del SERVIDOR (Gemini del equipo o ' +
      'banco de keys) en vez de razonarla vos. Útil para comparar tu lectura con la del servidor o para drenar chats ' +
      'sin gastar contexto. Construye el expediente, corre el prompt activo sales-ops.classify, reconcilia con las ' +
      'reglas R1–R11 y guarda una versión nueva. Si el equipo no tiene IA configurada guarda sólo lo determinístico ' +
      'con estado en_proceso y lo avisa en aiError (no falla). Con dry_run=true no guarda. Devuelve lo mismo que ' +
      'whatspro_sales_classification_write.',
    inputSchema: {
      type: 'object',
      required: ['chat_id'],
      properties: {
        chat_id: { type: 'integer', minimum: 1 },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

const pendingSchema = z.object({
  source: z.enum(['prefiltro', 'stale', 'all']).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
const dossierSchemaInput = z.object({ chat_id: z.number().int().positive() });
const writeSchema = z.object({
  chat_id: z.number().int().positive(),
  classification: z.record(z.string(), z.unknown()),
  connector: z.enum(CONNECTORS),
  prompt_version: z.number().int().min(0).nullable().optional(),
  dry_run: z.boolean().optional(),
});
const serverSchema = z.object({ chat_id: z.number().int().positive(), dry_run: z.boolean().optional() });

function friendly(error: unknown): never {
  if (error instanceof DossierError || error instanceof ClassificationInputError) throw new Error(error.message);
  throw error;
}

export async function executeDossierTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_sales_pending') {
    await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
    const data = parse(pendingSchema, input);
    const rows = await listPendingChats(context.teamId, { source: data.source, limit: data.limit });
    const bySignal: Record<string, number> = {};
    for (const row of rows) for (const s of row.signals) bySignal[s] = (bySignal[s] ?? 0) + 1;
    return {
      source: data.source ?? 'prefiltro',
      total: rows.length,
      bySignal,
      audiosToQueue: rows.filter((r) => r.pendingAudios > 0).map((r) => ({ chat_id: r.chatId, pendingAudios: r.pendingAudios })),
      rows,
    };
  }

  if (name === 'whatspro_sales_dossier') {
    await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
    const data = parse(dossierSchemaInput, input);
    try {
      const [dossier, prompt] = await Promise.all([buildChatDossier(context.teamId, data.chat_id), getActivePrompt(context.teamId, SALES_OPS_PROMPT_KEYS.classify)]);
      return { dossier, prompt: { key: prompt.key, version: prompt.version, source: prompt.source } };
    } catch (error) {
      friendly(error);
    }
  }

  if (name === 'whatspro_sales_classification_write') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(writeSchema, input);
    try {
      const result = await classifyChat(context.teamId, data.chat_id, {
        engine: 'connector',
        classification: data.classification,
        connector: data.connector,
        userId: context.userId,
        dryRun: data.dry_run,
        promptVersion: data.prompt_version ?? null,
      });
      return summarize(result);
    } catch (error) {
      friendly(error);
    }
  }

  if (name === 'whatspro_sales_classify_server') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(serverSchema, input);
    try {
      const result = await classifyChat(context.teamId, data.chat_id, { engine: 'server', userId: context.userId, dryRun: data.dry_run });
      return summarize(result);
    } catch (error) {
      friendly(error);
    }
  }

  throw new Error(`sales-ops dossier tools: tool desconocida ${name}`);
}

function summarize(result: Awaited<ReturnType<typeof classifyChat>>) {
  return {
    chat_id: result.chatId,
    analysis_id: result.analysisId,
    version: result.version,
    reason: result.reason,
    engine: result.engine,
    analyzed_by: result.analyzedBy,
    gate: result.gate,
    max_gate: result.maxGate,
    status: result.status,
    confidence: result.confidence,
    recovery_probability: result.recoveryProbability,
    priority_score: result.priorityScore,
    potential_value_usd: result.potentialValueUsd,
    human_override_kept: result.humanOverrideKept,
    ai_used: result.aiUsed,
    ai_error: result.aiError,
    warnings: result.warnings,
    diff: result.diff,
    dry_run: result.dryRun,
    facts: result.facts,
    row: result.row,
  };
}
