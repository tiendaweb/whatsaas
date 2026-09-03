import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { snoozeLead, transferLead, unsnoozeLead } from '@/lib/plugins/sales-ops/server/lead';
import { OWNERS } from '@/lib/plugins/sales-ops/shared/taxonomy';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snooze'), days: z.number().int().min(1).max(365), note: z.string().max(200).optional() }),
  z.object({ action: z.literal('unsnooze') }),
  z.object({ action: z.literal('transfer'), owner: z.enum(OWNERS) }),
]);

/** POST { action: 'snooze', days, note? } | { action: 'unsnooze' } | { action: 'transfer', owner } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  try {
    if (parsed.data.action === 'snooze') {
      const until = new Date(Date.now() + parsed.data.days * 24 * 60 * 60 * 1000);
      return NextResponse.json(await snoozeLead(ctx.team.id, ctx.user.id, chatId, until, parsed.data.note));
    }
    if (parsed.data.action === 'unsnooze') return NextResponse.json(await unsnoozeLead(ctx.team.id, ctx.user.id, chatId));
    return NextResponse.json(await transferLead(ctx.team.id, ctx.user.id, chatId, parsed.data.owner));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
