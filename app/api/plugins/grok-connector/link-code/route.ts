import { NextResponse } from 'next/server';
import { getGrokDashboardTarget } from '@/lib/plugins/grok-connector/server/dashboard';
import { createLinkCode } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const target = await getGrokDashboardTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const code = await createLinkCode(target);
  return NextResponse.json(code, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
