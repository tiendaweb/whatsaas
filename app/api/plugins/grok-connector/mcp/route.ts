import { NextRequest, NextResponse } from 'next/server';
import {
  getReadOnlyPlugin,
  getReadOnlyResource,
  listReadOnlyPlugins,
  listReadOnlyResource,
  readOnlyPluginCatalogMetadata,
  readOnlyResourceMap,
  readOnlyResourceMetadata,
  readOnlyResources,
} from '@/lib/readonly-api/catalog';
import { buildAiContext } from '@/lib/readonly-api/openapi';
import { executeGrokAction, grokActionTools } from '@/lib/plugins/grok-connector/server/actions';
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
];

const actionTools = [
  ...grokActionTools,
  ...grokExtendedActionTools,
  ...automationActionTools,
  ...businessOsActionTools,
  ...platformAdminActionTools,
];

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

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

async function callTool(
  name: string,
  args: Record<string, unknown>,
  context: { teamId: number; userId: number; origin: string; actionsEnabled: boolean },
) {
  const { teamId, origin } = context;
  if (automationReadTools.some((tool) => tool.name === name)) {
    return executeAutomationTool(name, args, { teamId, userId: context.userId });
  }
  if (businessOsReadTools.some((tool) => tool.name === name)) {
    return executeBusinessOsReadTool(name, args, { teamId, userId: context.userId });
  }
  if (platformAdminReadTools.some((tool) => tool.name === name)) {
    return executePlatformAdminTool(name, args, { teamId, userId: context.userId });
  }
  if (actionTools.some((tool) => tool.name === name)) {
    if (!context.actionsEnabled) throw new Error('This connection does not have whatspro:write. Reconnect the assistant to authorize actions.');
    const actionContext = { teamId, userId: context.userId };
    if (automationActionTools.some((tool) => tool.name === name)) return executeAutomationTool(name, args, actionContext);
    if (businessOsActionTools.some((tool) => tool.name === name)) return executeBusinessOsAction(name, args, actionContext);
    if (platformAdminActionTools.some((tool) => tool.name === name)) return executePlatformAdminTool(name, args, actionContext);
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
    return listReadOnlyResource(resource, teamId, params);
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
    const record = await getReadOnlyResource(resource, teamId, id);
    if (!record) throw new Error('Record not found.');
    return { object: 'record', resource: resourceKey, data: record };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleRpc(
  message: JsonRpcRequest,
  context: { teamId: number; userId: number; origin: string; actionsEnabled: boolean },
) {
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(message.id, -32600, 'Invalid Request');
  if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) return null;
  if (message.method === 'initialize') {
    return rpcResult(message.id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: context.actionsEnabled ? 'WhatsPro AI Connector' : 'WhatsPro AI Read-only Connector', version: '3.0.0' },
      instructions: context.actionsEnabled
        ? 'Enumera y consulta recursos antes de actuar. Para automatizaciones consulta whatspro_automation_guide. Para sitios, lee el archivo y conserva expected_updated_at antes de editar o parchar. Confirma IDs, respeta el aislamiento del equipo, usa claves de idempotencia estables y ejecuta eliminaciones solo cuando el usuario las solicite explícitamente.'
        : 'Acceso exclusivo de lectura. Enumera recursos antes de consultar; pagina resultados y nunca solicites ni reveles secretos.',
    });
  }
  if (message.method === 'ping') return rpcResult(message.id, {});
  if (message.method === 'tools/list') return rpcResult(message.id, {
    tools: context.actionsEnabled ? [...readOnlyTools, ...actionTools] : readOnlyTools,
  });
  if (message.method === 'tools/call') {
    const name = typeof message.params?.name === 'string' ? message.params.name : '';
    const args = message.params?.arguments && typeof message.params.arguments === 'object' && !Array.isArray(message.params.arguments)
      ? message.params.arguments as Record<string, unknown>
      : {};
    try {
      const value = await callTool(name, args, context);
      return rpcResult(message.id, {
        content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
      });
    } catch (error) {
      return rpcResult(message.id, {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'The operation failed.' }],
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
  const context = { teamId: auth.teamId, userId: auth.userId, origin, actionsEnabled };
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
