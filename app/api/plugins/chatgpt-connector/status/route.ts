import { NextRequest, NextResponse } from 'next/server';
import { CHATGPT_CONNECTOR_PLUGIN_ID, getChatGPTDashboardTarget } from '@/lib/plugins/chatgpt-connector/server/access';
import { listConnections, mcpResource, requestOrigin } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const target = await getChatGPTDashboardTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const origin = requestOrigin(request);
  const resource = mcpResource(origin, CHATGPT_CONNECTOR_PLUGIN_ID);
  const connections = await listConnections(target, resource);
  return NextResponse.json({
    targetEmail: target.email,
    transport: 'remote-mcp',
    readOnly: false,
    actions: true,
    mcpUrl: resource,
    connections,
  });
}
