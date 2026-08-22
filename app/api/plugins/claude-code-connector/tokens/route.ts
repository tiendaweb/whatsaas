import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createClaudeCodeToken,
  getClaudeCodeTarget,
  revokeClaudeCodeToken,
} from '@/lib/plugins/claude-code-connector/server/connector';

export const dynamic = 'force-dynamic';

const revokeSchema = z.object({ tokenId: z.number().int().positive() });

export async function POST() {
  const target = await getClaudeCodeTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const token = await createClaudeCodeToken(target);
  return NextResponse.json({ token }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const target = await getClaudeCodeTarget();
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const input = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  const revoked = await revokeClaudeCodeToken(target, input.data.tokenId);
  return revoked
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Token not found' }, { status: 404 });
}
