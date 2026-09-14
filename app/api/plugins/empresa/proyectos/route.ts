import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmpresaContext, getEmpresaWriteContext } from '@/lib/plugins/empresa/server/access';
import { crearProyecto } from '@/lib/plugins/empresa/server/proyectos-acciones';
import { getProyectosEmpresa } from '@/lib/plugins/empresa/server/proyectos';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const crearSchema = z.object({
  nombre: z.string().min(1).max(200),
  workspaceId: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const ctx = await getEmpresaContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const payload = await getProyectosEmpresa(ctx.team.id);
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const ctx = await getEmpresaWriteContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = crearSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Poné un nombre para el proyecto.' }, { status: 400 });

  const resultado = await crearProyecto(ctx.team.id, ctx.user.id, parsed.data);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json(resultado.data, { status: 201 });
}
