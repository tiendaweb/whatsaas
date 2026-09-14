import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmpresaWriteContext } from '@/lib/plugins/empresa/server/access';
import { archivarProyecto } from '@/lib/plugins/empresa/server/proyectos-acciones';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const archivarSchema = z.object({ proyectoId: z.number().int().positive() });

/**
 * Archiva la ficha del cliente del proyecto, que es lo que lo saca del CRM.
 *
 * Las guardas son las de Tareas OS y no se aflojan acá: hace falta un cliente
 * vinculado y ninguna tarea abierta. Archivar a un cliente con trabajo
 * pendiente lo esconde del CRM sin que nadie haya decidido darlo de baja.
 */
export async function POST(request: Request) {
  const ctx = await getEmpresaWriteContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = archivarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Proyecto inválido.' }, { status: 400 });

  const resultado = await archivarProyecto(ctx.team.id, ctx.user.id, parsed.data.proyectoId);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json(resultado.data);
}
