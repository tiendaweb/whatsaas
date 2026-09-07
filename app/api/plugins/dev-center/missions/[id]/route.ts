import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { getMission, updateMission } from '@/lib/plugins/dev-center/server/missions';
import { MISSION_MODES, MISSION_STATUSES } from '@/lib/plugins/dev-center/shared/types';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  status: z.enum(MISSION_STATUSES).optional(),
  resultSummary: z.string().max(8000).nullable().optional(),
  title: z.string().trim().min(2).max(200).optional(),
  prompt: z.string().min(5).max(20000).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  tmuxName: z.string().max(80).nullable().optional(),
  mode: z.enum(MISSION_MODES).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios.' });

const idDe = async (params: Promise<{ id: string }>) => {
  const { id } = await params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const id = await idDe(params);
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  const mission = await getMission(p.teamId, id);
  if (!mission) return NextResponse.json({ error: 'No existe la misión.' }, { status: 404 });
  return NextResponse.json({ mission });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const id = await idDe(params);
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Los cambios tienen campos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json({ mission: await updateMission(p.teamId, p.user.id, id, parsed.data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar la misión.';
    return NextResponse.json({ error: message }, { status: message.includes('No existe') ? 404 : 409 });
  }
}
