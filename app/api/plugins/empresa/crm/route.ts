import { NextResponse } from 'next/server';
import { getEmpresaContext } from '@/lib/plugins/empresa/server/access';
import { getCrmEmpresa } from '@/lib/plugins/empresa/server/crm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getEmpresaContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const crudo = Number(url.searchParams.get('marca'));
  const marcaId = Number.isInteger(crudo) && crudo > 0 ? crudo : null;
  const busqueda = (url.searchParams.get('q') ?? '').trim().slice(0, 80) || null;
  const crudoEtiqueta = Number(url.searchParams.get('etiqueta'));
  const etiquetaId = Number.isInteger(crudoEtiqueta) && crudoEtiqueta > 0 ? crudoEtiqueta : null;

  const payload = await getCrmEmpresa(ctx.team.id, marcaId, busqueda, etiquetaId);
  return NextResponse.json(payload);
}
