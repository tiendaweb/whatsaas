import { NextResponse } from 'next/server';

import { getClaudeCodeTarget } from '@/lib/plugins/claude-code-connector/server/connector';
import { createLinkCode } from '@/lib/plugins/grok-connector/server/oauth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const target = await getClaudeCodeTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await createLinkCode(target));
}
