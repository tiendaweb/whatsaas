import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { chatsPorTelefono } from '@/lib/plugins/sales-ops/server/telefonos';

export const dynamic = 'force-dynamic';

const schema = z.object({ numbers: z.array(z.string().max(40)).max(500) });

/**
 * POST { numbers } → a qué chat corresponde cada teléfono.
 *
 * Va por POST y no por query string porque la vista de Programados manda
 * cientos de números y una URL con eso adentro se corta.
 */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { numbers: string[] }' }, { status: 400 });
  try {
    return NextResponse.json({ map: await chatsPorTelefono(ctx.team.id, parsed.data.numbers) });
  } catch (error) {
    console.error('[sales-ops/scheduled/targets]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
