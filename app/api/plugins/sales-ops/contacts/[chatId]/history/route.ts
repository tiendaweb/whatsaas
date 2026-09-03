import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listContactHistory } from '@/lib/plugins/sales-ops/server/history';

export const dynamic = 'force-dynamic';

/** GET → historial de cambios del contacto (auditoría `SALES_OPS_*` de ese chat). */
export async function GET(_request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { chatId } = await params;
  const id = Number(chatId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'chatId inválido.' }, { status: 400 });

  try {
    const entries = await listContactHistory(ctx.team.id, id);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('[sales-ops/contacts/:chatId/history]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
