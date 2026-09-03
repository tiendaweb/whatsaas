import { NextRequest, NextResponse } from 'next/server';
import {
  CHATGPT_CONNECTOR_PLUGIN_ID,
  CLAUDE_CONNECTOR_PLUGIN_ID,
  GROK_CONNECTOR_PLUGIN_ID,
  mcpResource,
  requestOrigin,
  scopesForResource,
} from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  const connectorId = request.nextUrl.pathname.includes(`/plugins/${CHATGPT_CONNECTOR_PLUGIN_ID}/`)
    ? CHATGPT_CONNECTOR_PLUGIN_ID
    : request.nextUrl.pathname.includes(`/plugins/${CLAUDE_CONNECTOR_PLUGIN_ID}/`)
      ? CLAUDE_CONNECTOR_PLUGIN_ID
      : GROK_CONNECTOR_PLUGIN_ID;
  return NextResponse.json(
    {
      resource: mcpResource(origin, connectorId),
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      scopes_supported: scopesForResource(mcpResource(origin, connectorId)),
      resource_documentation: `${origin}/plugins/${connectorId}`,
    },
    { headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } },
  );
}
