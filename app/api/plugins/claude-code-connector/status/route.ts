import { NextRequest, NextResponse } from 'next/server';
import {
  getClaudeCodeTarget,
  listClaudeCodeTokens,
} from '@/lib/plugins/claude-code-connector/server/connector';
import {
  CLAUDE_CONNECTOR_PLUGIN_ID,
  listConnections,
  mcpResource,
  requestOrigin,
} from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const target = await getClaudeCodeTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const origin = requestOrigin(request);
  const resource = mcpResource(origin, CLAUDE_CONNECTOR_PLUGIN_ID);
  return NextResponse.json({
    targetEmail: target.email,
    readOnly: false,
    actions: true,
    transport: 'remote-mcp',
    mcpUrl: resource,
    connections: await listConnections(target, resource),
    baseUrl: origin,
    downloadUrl: '/integrations/whatspro-readonly-mcp.mjs',
    tokens: await listClaudeCodeTokens(target),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
