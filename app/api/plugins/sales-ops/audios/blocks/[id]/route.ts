import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { deleteAudioBlock, updateAudioBlock } from '@/lib/plugins/sales-ops/server/audio-blocks';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'paused']).optional(),
  notBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dailyCap: z.number().int().min(1).max(5000).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

/** PATCH { name?, description?, status?, notBefore?, dailyCap? } → edita un bloque (pausar, programar, tope). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  try {
    return NextResponse.json({ bloque: await updateAudioBlock(ctx.team.id, ctx.user.id, id, parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

/** DELETE → borra el bloque; sus audios vuelven a la cola sin bloque. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    return NextResponse.json(await deleteAudioBlock(ctx.team.id, ctx.user.id, id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
