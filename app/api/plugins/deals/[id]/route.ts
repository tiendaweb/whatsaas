import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { deleteDeal, getDeal, updateDeal } from '@/lib/deals/service';
import { DEAL_STAGES } from '@/lib/deals/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
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

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const ctx = await getPluginRequestContext('dealsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const deal = await getDeal(ctx.team.id, Number((await params).id));
  // Un id de otro equipo cae acá: 404, no 403. Un 403 confirmaría que existe.
  if (!deal) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ deal });
}

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await getPluginRequestContext('dealsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', issues: parsed.error.issues }, { status: 400 });
  }

  const { expectedCloseDate, ...rest } = parsed.data;
  const deal = await updateDeal(
    ctx.team.id,
    Number((await params).id),
    {
      ...rest,
      ...(expectedCloseDate !== undefined
        ? { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null }
        : {}),
    },
    ctx.user.id,
  );
  if (!deal) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ deal });
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await getPluginRequestContext('dealsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const done = await deleteDeal(ctx.team.id, Number((await params).id), ctx.user.id);
  if (!done) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  // La venta enlazada sobrevive: es un hecho contable.
  return NextResponse.json({ ok: true });
}
