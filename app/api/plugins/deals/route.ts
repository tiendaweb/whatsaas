import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { createDeal, listDeals } from '@/lib/deals/service';
import { DEAL_STAGES, isDealStage } from '@/lib/deals/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  customerId: z.number().int().positive().nullable().optional(),
  contactId: z.number().int().positive().nullable().optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  value: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
  ownerId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(10000).optional(),
});

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('dealsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const stage = url.searchParams.get('stage');
  const deals = await listDeals(ctx.team.id, {
    stage: stage && isDealStage(stage) ? stage : undefined,
    open: url.searchParams.get('open') === '1',
    stale: url.searchParams.get('stale') === '1',
    search: url.searchParams.get('q') ?? undefined,
    customerId: Number(url.searchParams.get('customer_id')) || undefined,
    contactId: Number(url.searchParams.get('contact_id')) || undefined,
    ownerId: Number(url.searchParams.get('owner_id')) || undefined,
    limit: Number(url.searchParams.get('limit')) || undefined,
  });
  return NextResponse.json({ deals });
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('dealsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', issues: parsed.error.issues }, { status: 400 });
  }

  const deal = await createDeal(
    ctx.team.id,
    {
      ...parsed.data,
      expectedCloseDate: parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null,
    },
    ctx.user.id,
  );
  return NextResponse.json({ deal }, { status: 201 });
}
