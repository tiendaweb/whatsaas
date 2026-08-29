import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { setVisibility } from '@/lib/plugins/sales-ops/server/accounts';
import { VISIBILITIES, VISIBILITY_TARGETS } from '@/lib/plugins/sales-ops/shared/accounts-types';

export const dynamic = 'force-dynamic';

const schema = z.object({
  target: z.enum(VISIBILITY_TARGETS),
  id: z.number().int().positive(),
  visibility: z.enum(VISIBILITIES),
});

/** PATCH { target: 'subscription'|'customer'|'company', id, visibility: 'visible'|'private'|'hidden' } */
export async function PATCH(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { target, id, visibility }' }, { status: 400 });
  try {
    return NextResponse.json(await setVisibility(ctx.team.id, ctx.user.id, parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: message === 'No existe en este equipo' ? 404 : 500 });
  }
}
