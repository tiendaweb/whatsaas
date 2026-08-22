import { NextRequest, NextResponse } from 'next/server';
import { getGrokDashboardTarget } from '@/lib/plugins/grok-connector/server/dashboard';
import { listConnections, mcpResource, requestOrigin } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const target = await getGrokDashboardTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const origin = requestOrigin(request);
  const resource = mcpResource(origin);
  const connections = await listConnections(target, resource);
  return NextResponse.json({
    mode: 'subscription-mcp',
    readOnly: false,
    actions: true,
    targetEmail: target.email,
    mcpUrl: resource,
    connections,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
