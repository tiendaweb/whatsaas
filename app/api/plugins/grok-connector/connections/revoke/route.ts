import { NextRequest, NextResponse } from 'next/server';
import { getGrokDashboardTarget } from '@/lib/plugins/grok-connector/server/dashboard';
import { revokeConnection } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const target = await getGrokDashboardTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const clientId = typeof body.clientId === 'string' ? body.clientId : '';
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  const revoked = await revokeConnection(target, clientId);
  return NextResponse.json({ revoked });
}
