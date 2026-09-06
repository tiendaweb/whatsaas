import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { CrmError, applyCrmFix, dismissCrmFix } from '@/lib/plugins/sales-ops/server/crm';
import { crmFixSchema, normalizeCrmFix } from '@/lib/plugins/sales-ops/shared/crm-fix';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ chatId: string }> };

/**
 * POST → aplica la corrección de CRM que propuso la clasificación.
 *
 * Sin cuerpo: la propuesta ya está guardada en el análisis y el cliente sólo
 * dice "dale". Con `{ fix }` aplica ESA corrección (la que "Ejecutar ahora" del
 * Focus acaba de proponer y la persona confirmó): pasa por el mismo aplicador,
 * con las mismas validaciones de pertenencia al equipo, y no toca la propuesta
 * guardada por la clasificación.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { fix?: unknown } | null;
  let fix: ReturnType<typeof normalizeCrmFix> | undefined;
  if (body?.fix !== undefined) {
    const parsed = crmFixSchema.safeParse(body.fix);
    if (!parsed.success) return NextResponse.json({ error: 'La corrección no tiene la forma esperada.' }, { status: 400 });
    fix = normalizeCrmFix(parsed.data);
    if (!fix) return NextResponse.json({ error: 'La corrección no propone nada.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await applyCrmFix(ctx.team.id, ctx.user.id, chatId, fix ? { fix } : {}));
  } catch (error) {
    if (error instanceof CrmError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error('[sales-ops/crm/apply]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

/** DELETE → descarta la corrección propuesta sin aplicarla. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  try {
    return NextResponse.json(await dismissCrmFix(ctx.team.id, ctx.user.id, chatId));
  } catch (error) {
    if (error instanceof CrmError) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
