import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmpresaWriteContext } from '@/lib/plugins/empresa/server/access';
import { editarTarea } from '@/lib/plugins/empresa/server/proyectos-acciones';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** `YYYY-MM-DD`, que es lo que emite un `<input type="date">`. */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/**
 * Editar una tarea desde Empresa. Es también el endpoint del arrastre del
 * tablero: mover una tarjeta de columna es mandar `columnaId`.
 */
const editarSchema = z.object({
  tareaId: z.number().int().positive(),
  titulo: z.string().max(500).optional(),
  notas: z.string().max(20000).optional(),
  columnaId: z.number().int().positive().optional(),
  responsableId: z.number().int().positive().nullable().optional(),
  inicio: fecha.optional(),
  fin: fecha.optional(),
  etiquetaIds: z.array(z.string().max(100)).max(50).optional(),
  hecha: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const ctx = await getEmpresaWriteContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = editarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Cambio inválido.' }, { status: 400 });

  const { tareaId, ...edicion } = parsed.data;
  const resultado = await editarTarea(ctx.team.id, tareaId, edicion);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json(resultado.data);
}
