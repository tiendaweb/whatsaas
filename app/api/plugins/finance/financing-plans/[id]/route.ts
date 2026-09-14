import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { cancelFinancingPlan, FinancingError } from '@/lib/plugins/finance/server/financing';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({ action: z.literal('cancel') });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    return NextResponse.json(await cancelFinancingPlan(ctx.team.id, ctx.user.id, id));
  } catch (error) {
    if (error instanceof FinancingError) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'not_found' ? 404 : 409 });
    }
    console.error('[finance financing-plans PATCH]', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
