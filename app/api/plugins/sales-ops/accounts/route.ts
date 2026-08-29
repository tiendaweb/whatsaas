import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listAccounts } from '@/lib/plugins/sales-ops/server/accounts';
import { ACCOUNT_KINDS, ACCOUNT_TABS, type AccountKind, type AccountTab } from '@/lib/plugins/sales-ops/shared/accounts-types';

export const dynamic = 'force-dynamic';

/** GET ?kind=customers|companies&tab=en_venta|privadas|vencidas|ocultas|todas&q=&cursor=&limit= */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const p = new URL(request.url).searchParams;
  const kind = p.get('kind') ?? 'customers';
  const tab = p.get('tab') ?? 'en_venta';
  if (!(ACCOUNT_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'kind inválido' }, { status: 400 });
  if (!(ACCOUNT_TABS as readonly string[]).includes(tab)) return NextResponse.json({ error: 'tab inválida' }, { status: 400 });
  const limitRaw = Number.parseInt(p.get('limit') ?? '', 10);
  try {
    const payload = await listAccounts(ctx.team.id, {
      kind: kind as AccountKind,
      tab: tab as AccountTab,
      q: p.get('q') ?? undefined,
      cursor: p.get('cursor'),
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[sales-ops/accounts]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
