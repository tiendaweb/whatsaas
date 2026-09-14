import { NextResponse } from 'next/server';
import { getMarketingContext } from '@/lib/plugins/marketing/server/access';
import { getResumenMarketing } from '@/lib/plugins/marketing/server/resumen';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getMarketingContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  // `?dias=` es el rango del panorama. Un valor basura cae al default en vez de
  // romper: vive en la URL y cualquiera puede pegarla mal.
  const crudo = Number(new URL(request.url).searchParams.get('dias'));
  const dias = Number.isInteger(crudo) && crudo >= 7 && crudo <= 180 ? crudo : 30;

  const payload = await getResumenMarketing(ctx.team.id, dias, ctx.user.id);
  return NextResponse.json(payload);
}
