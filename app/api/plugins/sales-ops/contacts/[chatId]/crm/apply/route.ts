import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { CrmError, applyCrmFix } from '@/lib/plugins/sales-ops/server/crm';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ chatId: string }> };

/**
 * POST → aplica la corrección de CRM que propuso la clasificación.
 *
 * Sin cuerpo: la propuesta ya está guardada en el análisis y el cliente sólo
 * dice "dale". Aceptar el patch desde el navegador sería otra puerta para
 * escribir el CRM, y ya existe una (`PATCH ../crm`) con su propia validación.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });

  try {
    return NextResponse.json(await applyCrmFix(ctx.team.id, ctx.user.id, chatId));
  } catch (error) {
    if (error instanceof CrmError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error('[sales-ops/crm/apply]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
