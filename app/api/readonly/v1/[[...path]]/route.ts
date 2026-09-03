import { NextRequest, NextResponse } from 'next/server';
import { authenticateReadOnlyApi, readOnlyRateLimitHeaders } from '@/lib/readonly-api/auth';
import {
  getReadOnlyResource,
  getReadOnlyPlugin,
  listReadOnlyPlugins,
  readOnlyPluginCatalogMetadata,
  listReadOnlyResource,
  readOnlyResourceMap,
  readOnlyResourceMetadata,
  readOnlyResources,
} from '@/lib/readonly-api/catalog';
import { buildAiContext, buildReadOnlyOpenApi } from '@/lib/readonly-api/openapi';

export const dynamic = 'force-dynamic';

const commonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Authorization',
};

type RouteContext = { params: Promise<{ path?: string[] }> };

function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...commonHeaders, ...headers } },
  );
}

function requestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin;
}

async function handle(request: NextRequest, context: RouteContext) {
  const auth = await authenticateReadOnlyApi(request.headers.get('authorization'));
  if (!auth.ok) {
    const headers = auth.rateLimit ? readOnlyRateLimitHeaders(auth.rateLimit) : undefined;
    return apiError(auth.status, auth.code, auth.message, headers);
  }

  const rateHeaders = readOnlyRateLimitHeaders(auth.context.rateLimit);
  const headers = { ...commonHeaders, ...rateHeaders };
  const { path = [] } = await context.params;
  const origin = requestOrigin(request);

  if (path.length === 0) {
    return NextResponse.json(
      {
        name: 'WhatsPro Read-only Data API',
        version: '1.1.0',
        readOnly: true,
        teamId: auth.context.teamId,
        token: { name: auth.context.tokenName, scopes: auth.context.scopes },
        resources: readOnlyResources.length + 1,
        links: {
          health: '/api/readonly/v1/health',
          resources: '/api/readonly/v1/resources',
          openapi: '/api/readonly/v1/openapi.json',
          aiContext: '/api/readonly/v1/ai-context.md',
          pluginCatalog: '/api/readonly/v1/plugin-catalog',
          mcpServer: '/integrations/whatspro-readonly-mcp.mjs',
        },
      },
      { headers },
    );
  }

  if (path.length === 1 && path[0] === 'health') {
    return NextResponse.json({ ok: true, readOnly: true, version: '1.1.0', teamId: auth.context.teamId }, { headers });
  }

  if (path.length === 1 && path[0] === 'resources') {
    return NextResponse.json(
      { object: 'catalog', data: [...readOnlyResources.map(readOnlyResourceMetadata), readOnlyPluginCatalogMetadata] },
      { headers },
    );
  }

  if (path.length === 1 && path[0] === 'openapi.json') {
    return NextResponse.json(buildReadOnlyOpenApi(origin), { headers });
  }

  if (path.length === 1 && path[0] === 'ai-context.md') {
    return new NextResponse(buildAiContext(origin), {
      headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  if (path[0] === readOnlyPluginCatalogMetadata.key && path.length <= 2) {
    try {
      if (path.length === 1) {
        return NextResponse.json(await listReadOnlyPlugins(auth.context.teamId, request.nextUrl.searchParams), { headers });
      }
      const plugin = await getReadOnlyPlugin(auth.context.teamId, path[1]);
      if (!plugin) return apiError(404, 'record_not_found', 'No registered plugin has that identifier.', rateHeaders);
      return NextResponse.json({ object: 'record', resource: readOnlyPluginCatalogMetadata.key, data: plugin }, { headers });
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_boolean') {
        return apiError(400, 'invalid_parameter', 'The installed and enabled filters accept only true or false.', rateHeaders);
      }
      console.error(`[readonly-api GET ${path.join('/')}]`, error);
      return apiError(500, 'internal_error', 'The plugin catalog could not be read.', rateHeaders);
    }
  }

  const resource = readOnlyResourceMap.get(path[0]);
  if (!resource || path.length > 2 || (path.length === 2 && !resource.itemLookup)) {
    return apiError(404, 'not_found', 'Resource not found. Use GET /api/readonly/v1/resources for discovery.', rateHeaders);
  }

  try {
    if (path.length === 1) {
      const result = await listReadOnlyResource(resource, auth.context.teamId, request.nextUrl.searchParams);
      return NextResponse.json(result, { headers });
    }

    const record = await getReadOnlyResource(resource, auth.context.teamId, path[1]);
    if (!record) return apiError(404, 'record_not_found', 'No record with that identifier exists in this team.', rateHeaders);
    return NextResponse.json({ object: 'record', resource: resource.key, data: record }, { headers });
  } catch (error) {
    if (error instanceof Error && ['invalid_number', 'invalid_boolean', 'invalid_date'].includes(error.message)) {
      return apiError(400, 'invalid_parameter', 'One query or path parameter has an invalid type.', rateHeaders);
    }
    console.error(`[readonly-api GET ${path.join('/')}]`, error);
    return apiError(500, 'internal_error', 'The resource could not be read.', rateHeaders);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const response = await handle(request, context);
  return new NextResponse(null, { status: response.status, headers: response.headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: commonHeaders });
}
