import { NextResponse } from 'next/server';
import { getChatGPTDashboardTarget } from '@/lib/plugins/chatgpt-connector/server/access';
import { createLinkCode } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const target = await getChatGPTDashboardTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await createLinkCode(target));
}
