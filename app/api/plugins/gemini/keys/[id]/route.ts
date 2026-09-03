import { NextResponse } from 'next/server';
import { z } from 'zod';
import { actualizarKey, borrarKey, listarKeys } from '@/lib/gemini/key-bank';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  /** Vacío = no la cambies. La UI nunca tuvo la key entera para reenviarla. */
  apiKey: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  model: z.string().trim().max(80).optional(),
  limitRpm: z.number().int().min(1).max(10000).optional(),
  limitRpd: z.number().int().min(1).max(1000000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

async function keyDelEquipo(teamId: number, id: number) {
  const keys = await listarKeys(teamId);
  return keys.find((key) => key.id === id) ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('aiAgent');
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  if (!(await keyDelEquipo(context.team.id, id))) {
    return NextResponse.json({ error: 'Esa API key no existe en este equipo.' }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  await actualizarKey(context.team.id, id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getPluginRequestContext('aiAgent');
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Id inválido' }, { status: 400 });
  if (!(await keyDelEquipo(context.team.id, id))) {
    return NextResponse.json({ error: 'Esa API key no existe en este equipo.' }, { status: 404 });
  }

  await borrarKey(context.team.id, id);
  return NextResponse.json({ ok: true });
}
