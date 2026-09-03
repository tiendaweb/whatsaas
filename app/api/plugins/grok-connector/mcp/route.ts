import { NextRequest, NextResponse } from 'next/server';
import type { SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs } from '@/lib/db/schema';
import {
  getReadOnlyPlugin,
  getReadOnlyResource,
  listReadOnlyPlugins,
  listReadOnlyResource,
  readOnlyPluginCatalogMetadata,
  readOnlyResourceMap,
  readOnlyResourceMetadata,
  readOnlyResources,
  type ReadOnlyResource,
} from '@/lib/readonly-api/catalog';
import { buildAiContext } from '@/lib/readonly-api/openapi';
import { chatVisibilityCondition, resourceAccessDenial } from '@/lib/readonly-api/actor-guard';
import { buildPermissionContext } from '@/lib/auth/permissions-guard';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { executeGrokAction, grokActionTools, isMcpRawResult } from '@/lib/plugins/grok-connector/server/actions';
import {
  dealsActionTools,
  dealsReadTools,
  executeDealsAction,
} from '@/lib/plugins/grok-connector/server/deals-actions';
import { executeNotifyTool, notifyActionTools, notifyReadTools } from '@/lib/notifications/tools';
import {
  commandCenterActionTools,
  commandCenterReadTools,
  desktopActionTools,
  desktopReadTools,
  executeDesktopTool,
} from '@/lib/plugins/grok-connector/server/desktop-actions';
import { chatActionTools, chatReadTools, executeChatTool } from '@/lib/plugins/grok-connector/server/chat-actions';
import {
  executeSettingsTool,
  settingsActionTools,
  settingsReadTools,
} from '@/lib/plugins/grok-connector/server/settings-actions';
import {
  executeMembershipsTool,
  membershipsActionTools,
  membershipsReadTools,
} from '@/lib/plugins/grok-connector/server/memberships-actions';
import {
  calendarActionTools,
  calendarReadTools,
  executeCalendarTool,
} from '@/lib/plugins/grok-connector/server/calendar-actions';
import {
  contentActionTools,
  contentReadTools,
  executeContentTool,
} from '@/lib/plugins/grok-connector/server/content-actions';
import {
  salesOpsActionTools,
  salesOpsReadTools,
  executeSalesOpsTool,
} from '@/lib/plugins/grok-connector/server/sales-ops-actions';
import {
  executeGrokExtendedAction,
  grokExtendedActionTools,
} from '@/lib/plugins/grok-connector/server/extended-actions';
import {
  automationActionTools,
  automationReadTools,
  executeAutomationTool,
} from '@/lib/plugins/grok-connector/server/automation-actions';
import {
  businessOsActionTools,
  businessOsReadTools,
  executeBusinessOsAction,
  executeBusinessOsReadTool,
} from '@/lib/plugins/grok-connector/server/business-os-actions';
import {
  executePlatformAdminTool,
  platformAdminActionTools,
  platformAdminReadTools,
} from '@/lib/plugins/grok-connector/server/platform-admin-actions';
import {
  executeRadarTool,
  radarActionTools,
  radarReadTools,
} from '@/lib/plugins/grok-connector/server/radar-actions';
import {
  executeRadarEngineTool,
  radarEngineActionTools,
  radarEngineReadTools,
} from '@/lib/plugins/grok-connector/server/radar-engine-actions';
import {
  businessThemeActionTools,
  businessThemeReadTools,
  executeBusinessThemeAction,
  executeBusinessThemeReadTool,
} from '@/lib/plugins/grok-connector/server/business-theme-actions';
import {
  executeTasksTool,
  tasksActionTools,
  tasksReadTools,
} from '@/lib/plugins/grok-connector/server/tasks-actions';
import {
  executeKnowledgeTool,
  knowledgeActionTools,
  knowledgeReadTools,
} from '@/lib/plugins/grok-connector/server/knowledge-actions';
import {
  executeMediaTool,
  mediaActionTools,
  mediaReadTools,
} from '@/lib/plugins/grok-connector/server/media-actions';
import {
  executeMessagingAction,
  messagingActionTools,
} from '@/lib/plugins/grok-connector/server/messaging-actions';
import {
  executeFinanceTool,
  financeActionTools,
  financeReadTools,
} from '@/lib/plugins/grok-connector/server/finance-actions';
import {
  attachmentsActionTools,
  attachmentsReadTools,
  executeAttachmentsTool,
} from '@/lib/plugins/grok-connector/server/attachments-actions';
import {
  checklistActionTools,
  executeChecklistTool,
} from '@/lib/plugins/grok-connector/server/checklist-actions';
import {
  executeTranscriptionTool,
  transcriptionActionTools,
  transcriptionReadTools,
} from '@/lib/plugins/grok-connector/server/transcription-actions';
import {
  executeLinksTool,
  linksActionTools,
  linksReadTools,
} from '@/lib/plugins/grok-connector/server/links-actions';
import {
  bulkActionTools,
  bulkReadTools,
  executeBulkTool,
} from '@/lib/plugins/grok-connector/server/bulk-actions';
import {
  executeOperationsTool,
  operationsActionTools,
  operationsReadTools,
} from '@/lib/plugins/grok-connector/server/operations-actions';
import {
  documentsPortalActionTools,
  documentsPortalReadTools,
  executeDocumentsPortalTool,
} from '@/lib/plugins/grok-connector/server/documents-portal-actions';
import {
  detailReadTools,
  executeDetailTool,
} from '@/lib/plugins/grok-connector/server/detail-actions';
import {
  executeHelpTool,
  helpReadTools,
} from '@/lib/plugins/grok-connector/server/help-actions';
import { executeAppMakerTool } from '@/lib/plugins/grok-connector/server/app-maker-actions';
import {
  APP_MAKER_MEDIA_SCOPE,
  APP_MAKER_PUBLISH_SCOPE,
  APP_MAKER_READ_SCOPE,
  APP_MAKER_WRITE_SCOPE,
  appMakerMediaTools,
  appMakerPublishTools,
  appMakerReadTools,
  appMakerWriteTools,
  requiredAppMakerScopes,
} from '@/lib/plugins/grok-connector/server/app-maker-tools';
import {
  CHATGPT_CONNECTOR_PLUGIN_ID,
  CLAUDE_CONNECTOR_PLUGIN_ID,
  GROK_CONNECTOR_PLUGIN_ID,
  GROK_WRITE_SCOPE,
  authenticateMcp,
  mcpResource,
  requestOrigin,
} from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
  'Access-Control-Max-Age': '600',
};

const readOnlyTools = [
  {
    name: 'whatspro_list_resources',
    description: 'Enumera todos los recursos de WhatsPro disponibles en modo solo lectura, incluidos campos y filtros.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_list_records',
    description: 'Lee una lista paginada de un recurso de WhatsPro. Nunca puede crear, editar ni eliminar datos.',
    inputSchema: {
      type: 'object',
      required: ['resource'],
      properties: {
        resource: { type: 'string', description: 'Clave devuelta por whatspro_list_resources.' },
        page: { type: 'integer', minimum: 1, default: 1 },
        per_page: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        q: { type: 'string', description: 'Búsqueda de texto cuando el recurso la admite.' },
        filters: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_get_record',
    description: 'Lee un registro por recurso e identificador. Nunca puede modificar datos.',
    inputSchema: {
      type: 'object',
      required: ['resource', 'id'],
      properties: { resource: { type: 'string' }, id: { type: ['string', 'number'] } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_ai_context',
    description: 'Carga la guía completa de recursos, relaciones y recetas de investigación de WhatsPro preparada para una IA.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  ...automationReadTools,
  ...businessOsReadTools,
  ...platformAdminReadTools,
  ...radarReadTools,
  ...radarEngineReadTools,
  ...businessThemeReadTools,
  ...tasksReadTools,
  ...knowledgeReadTools,
  ...mediaReadTools,
  ...documentsPortalReadTools,
  ...operationsReadTools,
  ...financeReadTools,
  ...attachmentsReadTools,
  ...transcriptionReadTools,
  ...linksReadTools,
  ...bulkReadTools,
  ...dealsReadTools,
  ...salesOpsReadTools,
  ...notifyReadTools,
  ...detailReadTools,
  ...desktopReadTools,
  ...commandCenterReadTools,
  ...chatReadTools,
  ...settingsReadTools,
  ...membershipsReadTools,
  ...calendarReadTools,
  ...contentReadTools,
  ...helpReadTools,
];

const actionTools = [
  ...grokActionTools,
  ...grokExtendedActionTools,
  ...automationActionTools,
  ...businessOsActionTools,
  ...platformAdminActionTools,
  ...radarActionTools,
  ...radarEngineActionTools,
  ...businessThemeActionTools,
  ...tasksActionTools,
  ...knowledgeActionTools,
  ...mediaActionTools,
  ...documentsPortalActionTools,
  ...messagingActionTools,
  ...operationsActionTools,
  ...financeActionTools,
  ...attachmentsActionTools,
  ...checklistActionTools,
  ...transcriptionActionTools,
  ...linksActionTools,
  ...bulkActionTools,
  ...dealsActionTools,
  ...salesOpsActionTools,
  ...notifyActionTools,
  ...desktopActionTools,
  ...commandCenterActionTools,
  ...chatActionTools,
  ...settingsActionTools,
  ...membershipsActionTools,
  ...calendarActionTools,
  ...contentActionTools,
];

/**
 * Orden de `tools/list`: lo indispensable primero.
 *
 * El catálogo pasó de 67 a casi 190 herramientas y varios clientes MCP cargan
 * sólo las primeras N de una conexión — ChatGPT entre ellos. Con el orden
 * "natural" (todas las de lectura y después todas las de acción), las tools de
 * ENVÍO quedaban en la posición ~163 y simplemente no existían para el modelo:
 * de ahí el "el conector no ofrece envío directo de mensajes o archivos", que
 * era falso pero indistinguible desde el lado del cliente.
 *
 * Esta lista no agrega ni quita nada: sólo garantiza que, se corte donde se
 * corte, lo que sobreviva sea lo que se usa todos los días.
 */
const PRIORITY_TOOLS = [
  // Catálogo y lectura genérica: sin esto el modelo no sabe qué existe.
  'whatspro_list_resources',
  'whatspro_list_records',
  'whatspro_get_record',
  'whatspro_ai_context',
  'whatspro_help_domain',
  // La cola unificada: es la primera llamada de cualquier sesión de trabajo.
  'whatspro_work_queue',
  'whatspro_command_center_inbox',
  'whatspro_command_center_execute',
  'whatspro_sales_execute_batch',
  'whatspro_desktop_search',
  'whatspro_chat_mark_read',
  // Hablarle al cliente. Lo más pedido y lo que estaba cayendo del corte.
  'whatspro_chat_send_message',
  'whatspro_chat_send_media',
  'whatspro_chat_trigger_automation',
  // Archivos de la conversación.
  'whatspro_chat_media_summary',
  'whatspro_chat_media_list',
  'whatspro_chat_media_get',
  'whatspro_chat_media_link',
  'whatspro_transcribe_media',
  'whatspro_pending_audios',
  'whatspro_files_list',
  'whatspro_files_get',
  // Contexto de un cliente antes de contestarle.
  'whatspro_contact_graph',
  'whatspro_customer_360',
  'whatspro_private_notes',
  'whatspro_custom_fields',
  'whatspro_customer_notes',
  'whatspro_crm_funnel_snapshot',
  // Escritura de CRM.
  'whatspro_save_contact',
  'whatspro_set_custom_fields',
  'whatspro_change_crm_stage',
  'whatspro_set_contact_tags',
  'whatspro_add_internal_note',
  'whatspro_add_contact_note',
  // Tareas.
  'whatspro_tasks_today',
  'whatspro_tasks_search',
  'whatspro_tasks_get',
  'whatspro_tasks_board',
  'whatspro_manage_task',
  'whatspro_tasks_assign',
  'whatspro_tasks_comment',
  // Command Center Comercial.
  'whatspro_sales_work_queue',
  'whatspro_sales_prompt_result',
  'whatspro_sales_prompts_list',
  'whatspro_sales_prompt_get',
  'whatspro_sales_prompt_render',
  'whatspro_sales_prompt_launch',
  'whatspro_sales_prompt_manage',
  'whatspro_sales_pending',
  'whatspro_sales_dossier',
  'whatspro_sales_classification_write',
  'whatspro_sales_queue_list',
  'whatspro_sales_queue_propose',
  'whatspro_sales_queue_approve',
  'whatspro_sales_queue_result',
  'whatspro_sales_signal_write',
  'whatspro_sales_signals_list',
  // Radar.
  'whatspro_radar_upsert_widget',
  'whatspro_radar_publish_report',
  'whatspro_radar_list_widgets',
];

/**
 * Reordena estable: primero `appTools` (que ya vienen acotadas por scope),
 * después las prioritarias en el orden de arriba, y detrás todo lo demás tal
 * como estaba. Nada se pierde.
 */
function orderTools<T extends { name: string }>(appTools: T[], rest: T[]) {
  const rank = new Map(PRIORITY_TOOLS.map((name, index) => [name, index]));
  const priority: T[] = [];
  const others: T[] = [];
  for (const tool of rest) (rank.has(tool.name) ? priority : others).push(tool);
  priority.sort((a, b) => rank.get(a.name)! - rank.get(b.name)!);
  return [...appTools, ...priority, ...others];
}

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

type McpContext = {
  teamId: number;
  userId: number;
  origin: string;
  connectorId: string;
  tokenId: number;
  actionsEnabled: boolean;
  scopes: string[];
};

/**
 * Un registro por cada tools/call — lecturas incluidas — con la tool, el
 * conector y el token que actuó. Antes en activity_logs quedaba sólo la
 * acción de dominio (GROK_TASK_UPDATED), nunca la tool ni el cliente OAuth:
 * "qué le pedí a Grok el martes" era irreconstruible, y las lecturas no
 * dejaban rastro alguno. Fire-and-forget: auditar no puede frenar la respuesta.
 */
function logToolCall(
  context: McpContext,
  tool: string,
  args: Record<string, unknown>,
  outcome: { ok: boolean; ms: number; error?: string },
) {
  db.insert(activityLogs).values({
    teamId: context.teamId,
    userId: context.userId,
    action: 'connector.tool_call',
    metadata: {
      tool,
      connector: context.connectorId,
      tokenId: context.tokenId,
      // Sólo las claves: los valores pueden ser enormes o sensibles.
      argKeys: Object.keys(args),
      ok: outcome.ok,
      ms: outcome.ms,
      ...(outcome.error ? { error: outcome.error.slice(0, 300) } : {}),
    },
  }).catch((error) => console.error('[grok-connector] Could not log tool call', error));
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function paramsFromArguments(args: Record<string, unknown>) {
  const params = new URLSearchParams();
  params.set('page', String(Number.isInteger(args.page) ? args.page : 1));
  params.set('per_page', String(Number.isInteger(args.per_page) ? args.per_page : 50));
  if (typeof args.q === 'string' && args.q) params.set('q', args.q);
  if (args.filters && typeof args.filters === 'object' && !Array.isArray(args.filters)) {
    for (const [key, value] of Object.entries(args.filters)) {
      if (['string', 'number', 'boolean'].includes(typeof value)) params.set(key, String(value));
    }
  }
  return params;
}

/**
 * El portero del catálogo de sólo lectura para el conector (pendientes A3 y A4).
 *
 * Hasta acá `whatspro_list_records` leía cualquiera de los 131 recursos sin
 * chequear un solo permiso, y los recursos de conversaciones ignoraban la
 * visibilidad de chats del usuario. El aislamiento por equipo nunca estuvo en
 * duda; lo que faltaba era la frontera de adentro del equipo.
 *
 * Corre sólo en el conector, que es el único camino de lectura que sabe QUIÉN
 * está detrás del token. Devuelve las condiciones extra que hay que sumarle a la
 * consulta, o tira si el actor directamente no puede ver ese recurso.
 */
async function guardReadOnlyResource(
  resourceKey: string,
  resource: ReadOnlyResource,
  context: McpContext,
): Promise<SQL[]> {
  const ctx = await buildPermissionContext(context.teamId, context.userId);
  if (!ctx) throw new Error('No hay membresía activa para este usuario en este equipo.');

  const active = new Set((await resolveActivePluginsForTeam(ctx.teamId, ctx.userId)).map((item) => item.pluginId));
  const denial = resourceAccessDenial(ctx, resourceKey, active);
  if (denial) throw new Error(denial);

  const condition = await chatVisibilityCondition(ctx, resource);
  return condition ? [condition] : [];
}

async function callTool(name: string, args: Record<string, unknown>, context: McpContext) {
  const { teamId, origin } = context;
  // El conector de ChatGPT descarta todo bloque de contenido que no sea texto,
  // así que las imágenes, audios y PDF nunca le llegaban: recibía la ficha del
  // archivo y ningún byte. Con esta bandera las tools de media agregan además
  // un enlace firmado que se abre sin cabeceras.
  const mediaContext = {
    teamId,
    userId: context.userId,
    privateMediaBaseUrl: `${origin}/api/plugins/${context.connectorId}/media`,
    signedLinks: context.connectorId === CHATGPT_CONNECTOR_PLUGIN_ID,
  };
  const appMakerScopes = requiredAppMakerScopes(name);
  if (appMakerScopes) {
    const missing = appMakerScopes.filter((scope) => !context.scopes.includes(scope));
    if (missing.length) throw new Error(`This connection is missing ${missing.join(', ')}. Reconnect the assistant to authorize App Maker.`);
    return executeAppMakerTool(name, args, { teamId, userId: context.userId });
  }
  if (automationReadTools.some((tool) => tool.name === name)) {
    return executeAutomationTool(name, args, { teamId, userId: context.userId });
  }
  if (businessOsReadTools.some((tool) => tool.name === name)) {
    return executeBusinessOsReadTool(name, args, { teamId, userId: context.userId });
  }
  if (platformAdminReadTools.some((tool) => tool.name === name)) {
    return executePlatformAdminTool(name, args, { teamId, userId: context.userId });
  }
  if (radarReadTools.some((tool) => tool.name === name)) {
    return executeRadarTool(name, args, { teamId, userId: context.userId });
  }
  if (radarEngineReadTools.some((tool) => tool.name === name)) {
    return executeRadarEngineTool(name, args, { teamId, userId: context.userId });
  }
  if (businessThemeReadTools.some((tool) => tool.name === name)) {
    return executeBusinessThemeReadTool(name, args, { teamId, userId: context.userId });
  }
  if (tasksReadTools.some((tool) => tool.name === name)) {
    return executeTasksTool(name, args, { teamId, userId: context.userId });
  }
  if (knowledgeReadTools.some((tool) => tool.name === name)) {
    return executeKnowledgeTool(name, args, { teamId, userId: context.userId });
  }
  if (mediaReadTools.some((tool) => tool.name === name)) {
    return executeMediaTool(name, args, mediaContext);
  }
  if (documentsPortalReadTools.some((tool) => tool.name === name)) {
    return executeDocumentsPortalTool(name, args, { teamId, userId: context.userId });
  }
  if (operationsReadTools.some((tool) => tool.name === name)) {
    return executeOperationsTool(name, args, { teamId, userId: context.userId });
  }
  if (financeReadTools.some((tool) => tool.name === name)) {
    return executeFinanceTool(name, args, { teamId, userId: context.userId });
  }
  if (attachmentsReadTools.some((tool) => tool.name === name)) {
    return executeAttachmentsTool(name, args, { teamId, userId: context.userId });
  }
  if (transcriptionReadTools.some((tool) => tool.name === name)) {
    return executeTranscriptionTool(name, args, mediaContext);
  }
  if (linksReadTools.some((tool) => tool.name === name)) {
    return executeLinksTool(name, args, { teamId, userId: context.userId });
  }
  if (bulkReadTools.some((tool) => tool.name === name)) {
    return executeBulkTool(name, args, { teamId, userId: context.userId });
  }
  if (dealsReadTools.some((tool) => tool.name === name)) {
    return executeDealsAction(name, args, { teamId, userId: context.userId });
  }
  if (salesOpsReadTools.some((tool) => tool.name === name)) {
    return executeSalesOpsTool(name, args, { teamId, userId: context.userId });
  }
  if (notifyReadTools.some((tool) => tool.name === name) || notifyActionTools.some((tool) => tool.name === name)) {
    return executeNotifyTool(name, args, { teamId, userId: context.userId });
  }
  if (detailReadTools.some((tool) => tool.name === name)) {
    return executeDetailTool(name, args, { teamId, userId: context.userId });
  }
  if (helpReadTools.some((tool) => tool.name === name)) {
    return executeHelpTool(name, args, { teamId, userId: context.userId });
  }
  if (desktopReadTools.some((tool) => tool.name === name) || commandCenterReadTools.some((tool) => tool.name === name)) {
    return executeDesktopTool(name, args, { teamId, userId: context.userId });
  }
  if (chatReadTools.some((tool) => tool.name === name)) return executeChatTool(name, args, { teamId, userId: context.userId });
  if (settingsReadTools.some((tool) => tool.name === name)) return executeSettingsTool(name, args, { teamId, userId: context.userId });
  if (membershipsReadTools.some((tool) => tool.name === name)) return executeMembershipsTool(name, args, { teamId, userId: context.userId });
  if (calendarReadTools.some((tool) => tool.name === name)) return executeCalendarTool(name, args, { teamId, userId: context.userId });
  if (contentReadTools.some((tool) => tool.name === name)) return executeContentTool(name, args, { teamId, userId: context.userId });
  if (actionTools.some((tool) => tool.name === name)) {
    if (!context.actionsEnabled) throw new Error('This connection does not have whatspro:write. Reconnect the assistant to authorize actions.');
    const actionContext = { teamId, userId: context.userId };
    if (automationActionTools.some((tool) => tool.name === name)) return executeAutomationTool(name, args, actionContext);
    if (businessOsActionTools.some((tool) => tool.name === name)) return executeBusinessOsAction(name, args, actionContext);
    if (platformAdminActionTools.some((tool) => tool.name === name)) return executePlatformAdminTool(name, args, actionContext);
    if (radarActionTools.some((tool) => tool.name === name)) return executeRadarTool(name, args, actionContext);
    if (radarEngineActionTools.some((tool) => tool.name === name)) return executeRadarEngineTool(name, args, actionContext);
    if (businessThemeActionTools.some((tool) => tool.name === name)) return executeBusinessThemeAction(name, args, actionContext);
    if (tasksActionTools.some((tool) => tool.name === name)) return executeTasksTool(name, args, actionContext);
    if (knowledgeActionTools.some((tool) => tool.name === name)) return executeKnowledgeTool(name, args, actionContext);
    if (mediaActionTools.some((tool) => tool.name === name)) return executeMediaTool(name, args, mediaContext);
    if (documentsPortalActionTools.some((tool) => tool.name === name)) return executeDocumentsPortalTool(name, args, actionContext);
    if (messagingActionTools.some((tool) => tool.name === name)) return executeMessagingAction(name, args, actionContext);
    if (operationsActionTools.some((tool) => tool.name === name)) return executeOperationsTool(name, args, actionContext);
    if (financeActionTools.some((tool) => tool.name === name)) return executeFinanceTool(name, args, actionContext);
    if (attachmentsActionTools.some((tool) => tool.name === name)) return executeAttachmentsTool(name, args, actionContext);
    if (checklistActionTools.some((tool) => tool.name === name)) return executeChecklistTool(name, args, actionContext);
    if (transcriptionActionTools.some((tool) => tool.name === name)) {
      return executeTranscriptionTool(name, args, mediaContext);
    }
    if (linksActionTools.some((tool) => tool.name === name)) return executeLinksTool(name, args, actionContext);
    if (bulkActionTools.some((tool) => tool.name === name)) return executeBulkTool(name, args, actionContext);
    if (dealsActionTools.some((tool) => tool.name === name)) return executeDealsAction(name, args, actionContext);
    if (salesOpsActionTools.some((tool) => tool.name === name)) return executeSalesOpsTool(name, args, actionContext);
    if (desktopActionTools.some((tool) => tool.name === name)) return executeDesktopTool(name, args, actionContext);
    if (commandCenterActionTools.some((tool) => tool.name === name)) return executeDesktopTool(name, args, actionContext);
    if (chatActionTools.some((tool) => tool.name === name)) return executeChatTool(name, args, actionContext);
    if (settingsActionTools.some((tool) => tool.name === name)) return executeSettingsTool(name, args, actionContext);
    if (membershipsActionTools.some((tool) => tool.name === name)) return executeMembershipsTool(name, args, actionContext);
    if (calendarActionTools.some((tool) => tool.name === name)) return executeCalendarTool(name, args, actionContext);
    if (contentActionTools.some((tool) => tool.name === name)) return executeContentTool(name, args, actionContext);
    if (grokActionTools.some((tool) => tool.name === name)) return executeGrokAction(name, args, actionContext);
    return executeGrokExtendedAction(name, args, actionContext);
  }
  if (name === 'whatspro_list_resources') {
    return { object: 'catalog', data: [...readOnlyResources.map(readOnlyResourceMetadata), readOnlyPluginCatalogMetadata] };
  }
  if (name === 'whatspro_ai_context') return buildAiContext(origin);
  const resourceKey = typeof args.resource === 'string' ? args.resource : '';
  if (!resourceKey) throw new Error('resource is required.');
  if (name === 'whatspro_list_records') {
    const params = paramsFromArguments(args);
    if (resourceKey === readOnlyPluginCatalogMetadata.key) return listReadOnlyPlugins(teamId, params);
    const resource = readOnlyResourceMap.get(resourceKey);
    if (!resource) throw new Error('Unknown resource. Run whatspro_list_resources first.');
    const extra = await guardReadOnlyResource(resourceKey, resource, context);
    return listReadOnlyResource(resource, teamId, params, extra);
  }
  if (name === 'whatspro_get_record') {
    if (args.id === undefined || args.id === null) throw new Error('id is required.');
    const id = String(args.id);
    if (resourceKey === readOnlyPluginCatalogMetadata.key) {
      const plugin = await getReadOnlyPlugin(teamId, id);
      if (!plugin) throw new Error('Record not found.');
      return { object: 'record', resource: resourceKey, data: plugin };
    }
    const resource = readOnlyResourceMap.get(resourceKey);
    if (!resource?.itemLookup) throw new Error('Unknown resource or item lookup is not supported.');
    const extra = await guardReadOnlyResource(resourceKey, resource, context);
    const record = await getReadOnlyResource(resource, teamId, id, extra);
    if (!record) throw new Error('Record not found.');
    return { object: 'record', resource: resourceKey, data: record };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleRpc(message: JsonRpcRequest, context: McpContext) {
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(message.id, -32600, 'Invalid Request');
  if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) return null;
  if (message.method === 'initialize') {
    return rpcResult(message.id, {
      protocolVersion: '2025-06-18',
      // La lista SÍ cambia: cada despliegue puede sumar herramientas. Con
      // listChanged en false los clientes cachean la lista de la primera
      // conexión y no vuelven a preguntar, así que las tools nuevas quedan
      // invisibles hasta que alguien reconecta a mano.
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: context.actionsEnabled || context.scopes.includes(APP_MAKER_WRITE_SCOPE) ? 'WhatsPro AI Connector' : 'WhatsPro AI Read-only Connector', version: '4.0.0' },
      instructions: context.actionsEnabled || context.scopes.includes(APP_MAKER_WRITE_SCOPE)
        ? 'Enumera y consulta recursos antes de actuar. Para App Maker consulta whatspro_appmaker_catalog y la versión actual; usa expected_version, separa borrador de publicación y confirma eliminaciones. Los adjuntos son privados y solo deben solicitarse cuando hagan falta. Para automatizaciones consulta whatspro_automation_guide. Para el Command Center Comercial (clasificación G0-GX, cola aprobada, radar de respuestas) empezá por whatspro_sales_work_queue: devuelve lo que espera un conector con la cadena exacta de tools; nunca modifiques el CRM desde ese flujo. Para sitios, conserva expected_updated_at antes de editar. Respeta el aislamiento del equipo y usa claves de idempotencia estables.'
        : 'Acceso de lectura. Enumera recursos y el catálogo de App Maker antes de consultar; pagina resultados, respeta audiencias y nunca solicites ni reveles secretos.',
    });
  }
  if (message.method === 'ping') return rpcResult(message.id, {});
  if (message.method === 'tools/list') {
    const appTools = [
      ...(context.scopes.includes(APP_MAKER_READ_SCOPE) ? appMakerReadTools : []),
      ...(context.scopes.includes(APP_MAKER_WRITE_SCOPE) ? appMakerWriteTools : []),
      ...(context.scopes.includes(APP_MAKER_PUBLISH_SCOPE) && context.scopes.includes(APP_MAKER_WRITE_SCOPE) ? appMakerPublishTools : []),
      ...(context.scopes.includes(APP_MAKER_MEDIA_SCOPE)
        ? appMakerMediaTools.filter((tool) => tool.name === 'whatspro_appmaker_get_attachment'
          ? context.scopes.includes(APP_MAKER_READ_SCOPE)
          : context.scopes.includes(APP_MAKER_WRITE_SCOPE))
        : []),
    ];
    // Claude and other MCP clients may prioritize only the first tools from a
    // large catalog. App Maker is scope-gated and intentionally comes first so
    // its capabilities are discoverable instead of being hidden after the
    // general WhatsPro and Radar tool families.
    return rpcResult(message.id, {
      tools: orderTools(appTools, [...readOnlyTools, ...(context.actionsEnabled ? actionTools : [])]),
    });
  }
  if (message.method === 'tools/call') {
    const name = typeof message.params?.name === 'string' ? message.params.name : '';
    const args = message.params?.arguments && typeof message.params.arguments === 'object' && !Array.isArray(message.params.arguments)
      ? message.params.arguments as Record<string, unknown>
      : {};
    const startedAt = Date.now();
    try {
      const value = await callTool(name, args, context);
      logToolCall(context, name, args, { ok: true, ms: Date.now() - startedAt });
      // Las tools de media devuelven bloques MCP privados image/audio/resource
      // para que el modelo pueda utilizar el contenido sin una URL pública.
      if (isMcpRawResult(value)) {
        return rpcResult(message.id, { content: value.__mcpContent });
      }
      return rpcResult(message.id, {
        content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The operation failed.';
      logToolCall(context, name, args, { ok: false, ms: Date.now() - startedAt, error: reason });
      return rpcResult(message.id, {
        isError: true,
        content: [{ type: 'text', text: reason }],
      });
    }
  }
  return rpcError(message.id, -32601, `Method not found: ${message.method}`);
}

function protectedMetadataUrl(origin: string, connectorId: string) {
  return `${origin}/.well-known/oauth-protected-resource/api/plugins/${connectorId}/mcp`;
}

async function handleMcpPost(request: NextRequest) {
  const origin = requestOrigin(request);
  const connectorId = request.nextUrl.pathname.includes('/plugins/chatgpt-connector/')
    ? CHATGPT_CONNECTOR_PLUGIN_ID
    : request.nextUrl.pathname.includes('/plugins/claude-code-connector/')
      ? CLAUDE_CONNECTOR_PLUGIN_ID
      : GROK_CONNECTOR_PLUGIN_ID;
  const resource = mcpResource(origin, connectorId);
  const auth = await authenticateMcp(request.headers.get('authorization'), resource);
  if (!auth.ok) {
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store',
      ...corsHeaders,
      'WWW-Authenticate': `Bearer resource_metadata="${protectedMetadataUrl(origin, connectorId)}"`,
    };
    if ('rate' in auth && auth.rate) {
      headers['X-RateLimit-Limit'] = '120';
      headers['X-RateLimit-Remaining'] = String(auth.rate.remaining);
      headers['X-RateLimit-Reset'] = String(auth.rate.resetAt);
    }
    return NextResponse.json({ error: auth.code }, { status: auth.status, headers });
  }
  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: corsHeaders });
  }
  const messages = Array.isArray(payload) ? payload : [payload];
  if (!messages.length) return NextResponse.json(rpcError(null, -32600, 'Invalid Request'), { status: 400, headers: corsHeaders });
  const actionsEnabled = auth.scopes.includes(GROK_WRITE_SCOPE);
  const context: McpContext = {
    teamId: auth.teamId,
    userId: auth.userId,
    origin,
    connectorId,
    tokenId: auth.tokenId,
    actionsEnabled,
    scopes: auth.scopes,
  };
  const responses = (await Promise.all(messages.map((message) => handleRpc(message, context)))).filter(Boolean);
  if (!responses.length) return new NextResponse(null, { status: 202, headers: { 'Cache-Control': 'no-store', ...corsHeaders } });
  return NextResponse.json(Array.isArray(payload) ? responses : responses[0], {
    headers: {
      'Cache-Control': 'no-store',
      ...corsHeaders,
      'X-RateLimit-Limit': '120',
      'X-RateLimit-Remaining': String(auth.rate.remaining),
      'X-RateLimit-Reset': String(auth.rate.resetAt),
    },
  });
}

async function handleMcpGet() {
  return NextResponse.json({ error: 'SSE streams are not enabled; use Streamable HTTP POST.' }, { status: 405, headers: { Allow: 'POST', ...corsHeaders } });
}

async function handleMcpDelete() {
  return NextResponse.json({ error: 'This stateless MCP server has no sessions to delete.' }, { status: 405, headers: { Allow: 'POST', ...corsHeaders } });
}

export async function POST(request: NextRequest) {
  return handleMcpPost(request);
}

export async function GET() {
  return handleMcpGet();
}

export async function DELETE() {
  return handleMcpDelete();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
