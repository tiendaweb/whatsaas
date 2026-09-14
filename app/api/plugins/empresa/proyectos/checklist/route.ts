import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmpresaWriteContext } from '@/lib/plugins/empresa/server/access';
import {
  agregarItemChecklist,
  alternarItemChecklist,
  quitarItemChecklist,
} from '@/lib/plugins/empresa/server/proyectos-acciones';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const agregarSchema = z.object({
  tareaId: z.number().int().positive(),
  texto: z.string().min(1).max(500),
});

const alternarSchema = z.object({
  tareaId: z.number().int().positive(),
  itemId: z.string().min(1).max(200),
  hecho: z.boolean(),
});

const quitarSchema = z.object({
  tareaId: z.number().int().positive(),
  itemId: z.string().min(1).max(200),
});

/**
 * Las tres operaciones mandan sólo el ítem que cambia, nunca la lista entera:
 * el servidor lee la checklist actual y la reescribe. Si el navegador mandara
 * su copia, un ítem agregado desde Tareas OS mientras esta pantalla estaba
 * abierta desaparecería al primer clic.
 */

export async function POST(request: Request) {
  const ctx = await getEmpresaWriteContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = agregarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Escribí el ítem antes de agregarlo.' }, { status: 400 });

  const resultado = await agregarItemChecklist(ctx.team.id, parsed.data.tareaId, parsed.data.texto);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json({ items: resultado.data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const ctx = await getEmpresaWriteContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = alternarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Cambio inválido.' }, { status: 400 });

  const resultado = await alternarItemChecklist(
    ctx.team.id,
    parsed.data.tareaId,
    parsed.data.itemId,
    parsed.data.hecho,
  );
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json({ items: resultado.data });
}

export async function DELETE(request: Request) {
  const ctx = await getEmpresaWriteContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = quitarSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ítem inválido.' }, { status: 400 });

  const resultado = await quitarItemChecklist(ctx.team.id, parsed.data.tareaId, parsed.data.itemId);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json({ items: resultado.data });
}
