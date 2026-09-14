import { NextResponse } from 'next/server';
import { getEmpresaContext } from '@/lib/plugins/empresa/server/access';
import { getPanoramaEmpresa } from '@/lib/plugins/empresa/server/panorama';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getEmpresaContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  // `?marca=` es el filtro global de la app. Un valor basura se ignora en vez
  // de romper: el filtro vive en la URL y cualquiera puede pegarla mal.
  const crudo = Number(new URL(request.url).searchParams.get('marca'));
  const marcaId = Number.isInteger(crudo) && crudo > 0 ? crudo : null;

  const payload = await getPanoramaEmpresa(ctx.team.id, marcaId);
  return NextResponse.json(payload);
}
