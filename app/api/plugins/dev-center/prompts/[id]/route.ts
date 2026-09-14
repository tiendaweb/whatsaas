import { NextRequest, NextResponse } from 'next/server';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { deleteDevPrompt, getDevPrompt, upsertDevPrompt } from '@/lib/plugins/dev-center/server/prompts';
import { promptSchema } from '@/lib/plugins/dev-center/shared/prompt-schema';

export const dynamic = 'force-dynamic';

const idDe = async (params: Promise<{ id: string }>) => {
  const { id } = await params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const id = await idDe(params);
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  const actual = await getDevPrompt(p.teamId, { id });
  if (!actual) return NextResponse.json({ error: 'No existe el prompt.' }, { status: 404 });
  // Parcial: lo que no viene se conserva.
  const parsed = promptSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'El prompt tiene campos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  try {
    const prompt = await upsertDevPrompt(p.teamId, p.user.id, {
      id,
      title: parsed.data.title ?? actual.title,
      body: parsed.data.body ?? actual.body,
      description: parsed.data.description !== undefined ? parsed.data.description : actual.description,
      agentDefault: parsed.data.agentDefault ?? actual.agentDefault,
      projectDefault: parsed.data.projectDefault !== undefined ? parsed.data.projectDefault : actual.projectDefault,
      modeDefault: parsed.data.modeDefault ?? actual.modeDefault,
      variables: parsed.data.variables ?? actual.variables,
      pinned: parsed.data.pinned ?? actual.pinned,
    });
    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo guardar el prompt.' }, { status: 422 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const id = await idDe(params);
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  try {
    return NextResponse.json(await deleteDevPrompt(p.teamId, id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo borrar.' }, { status: 404 });
  }
}
