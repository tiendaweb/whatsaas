import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listCrmFixes } from '@/lib/plugins/sales-ops/server/crm';

export const dynamic = 'force-dynamic';

/** GET → correcciones de CRM propuestas por la clasificación y todavía sin aplicar (para la Cola). */
export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  try {
    return NextResponse.json({ rows: await listCrmFixes(ctx.team.id) });
  } catch (error) {
    console.error('[sales-ops/crm-fixes]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
