import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { importHostingerDomains } from '@/lib/hostinger/import';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('hostingerWrite');
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Cuenta inválida.' }, { status: 400 });
  }

  try {
    const summary = await importHostingerDomains(ctx.team.id, id, ctx.user.id);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo importar el portfolio.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
