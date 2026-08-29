import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { getAccountDetail } from '@/lib/plugins/sales-ops/server/accounts';
import { ACCOUNT_KINDS, type AccountKind } from '@/lib/plugins/sales-ops/shared/accounts-types';

export const dynamic = 'force-dynamic';

/** GET /accounts/customers/:id | /accounts/companies/:id → detalle con membresías, links, contactos y plata. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { kind, id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!(ACCOUNT_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'kind inválido' }, { status: 400 });
  if (!Number.isInteger(numericId) || numericId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const detail = await getAccountDetail(ctx.team.id, { kind: kind as AccountKind, id: numericId });
    if (!detail) return NextResponse.json({ error: 'No existe' }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    console.error('[sales-ops/accounts/detail]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
