import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatGPTDashboardTarget } from '@/lib/plugins/chatgpt-connector/server/access';
import { revokeConnection } from '@/lib/plugins/grok-connector/server/oauth';

const inputSchema = z.object({ clientId: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  const target = await getChatGPTDashboardTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await revokeConnection(target, parsed.data.clientId);
  return NextResponse.json({ ok: true });
}
