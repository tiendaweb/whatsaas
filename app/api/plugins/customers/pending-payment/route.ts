import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { listCustomersPendingPayment } from '@/lib/plugins/customers/server/pending-payment';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Ver `lib/plugins/customers/server/pending-payment.ts`: la consulta vive ahí
 * porque la comparten este panel y la herramienta MCP de cobranzas. */
export async function GET() {
  const ctx = await getPluginRequestContext('customersRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await listCustomersPendingPayment(ctx.team.id));
}
