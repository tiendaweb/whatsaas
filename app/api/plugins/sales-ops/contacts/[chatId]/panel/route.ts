import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { getPanelChatSnapshot } from '@/lib/plugins/sales-ops/server/panel-chat';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ chatId: string }> };

/**
 * El resumen chico del Command Center para el panel del chat.
 *
 * Aparte de `[chatId]/route.ts` a propósito: ése arma el expediente entero
 * —mensajes, versiones, señales— y el panel del chat lo pediría en cada
 * conversación que se abre.
 */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });

  return NextResponse.json(await getPanelChatSnapshot(ctx.team.id, chatId));
}
