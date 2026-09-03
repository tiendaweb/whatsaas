import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { getChatSuggestions } from '@/lib/plugins/sales-ops/server/suggestions';

export const dynamic = 'force-dynamic';
/** Regenerar llama al modelo dentro del request. */
export const maxDuration = 120;

/**
 * GET ?chatId=&force=1 → siguientes acciones para ese chat.
 *
 * Devuelve las dos fuentes juntas porque en la ficha se muestran en una sola
 * fila: las que la IA eligió leyendo el expediente de ESE cliente
 * (`suggestions`, con el formulario ya pre-llenado) y las que coinciden por
 * regla con su gate o su última señal (`recommendations`). Sin `force` no se
 * gasta una llamada de IA: se sirve lo cacheado.
 */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext(new URL(request.url).searchParams.get('force') ? 'salesOpsWrite' : 'salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const chatId = Number(sp.get('chatId'));
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  try {
    return NextResponse.json(await getChatSuggestions(ctx.team.id, chatId, { force: sp.get('force') === '1' }));
  } catch (error) {
    console.error('[sales-ops/prompts/recommended]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
