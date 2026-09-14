import { NextResponse } from 'next/server';
import { getEmpresaContext } from '@/lib/plugins/empresa/server/access';
import { getMembresiasEmpresa } from '@/lib/plugins/empresa/server/membresias';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getEmpresaContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const crudo = Number(url.searchParams.get('marca'));
  const marcaId = Number.isInteger(crudo) && crudo > 0 ? crudo : null;

  const payload = await getMembresiasEmpresa(ctx.team.id, marcaId);
  return NextResponse.json(payload);
}
