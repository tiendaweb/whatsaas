import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAappRenewalRequestContext } from '@/lib/plugins/scheduled-messages/aapp-renewal-access';
import { applyAappRenewalAction } from '@/lib/plugins/scheduled-messages/aapp-renewals';

const schema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(['approve', 'reject', 'revoke', 'reopen', 'retry']),
});

export async function POST(request: Request) {
  const ctx = await getAappRenewalRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await applyAappRenewalAction({ teamId: ctx.team.id, userId: ctx.user.id, ...parsed.data });
  return NextResponse.json({ ok: true, ...result });
}
