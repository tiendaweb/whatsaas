import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { createMission, listMissions } from '@/lib/plugins/dev-center/server/missions';
import { MISSION_AGENTS, MISSION_MODES, MISSION_STATUSES } from '@/lib/plugins/dev-center/shared/types';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  project: z.string().trim().min(1).max(40),
  agent: z.enum(MISSION_AGENTS),
  mode: z.enum(MISSION_MODES).default('editar'),
  prompt: z.string().max(20000).optional(),
  promptId: z.number().int().positive().nullable().optional(),
  promptKey: z.string().max(64).nullable().optional(),
  variables: z.record(z.string(), z.string().max(4000)).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  launch: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const status = new URL(request.url).searchParams.get('status') ?? 'open';
  const valido = status === 'open' || status === 'all' || (MISSION_STATUSES as readonly string[]).includes(status);
  return NextResponse.json({ missions: await listMissions(p.teamId, { status: valido ? (status as 'open') : 'open' }) });
}

export async function POST(request: NextRequest) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'La misión tiene campos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  try {
    const mission = await createMission(p.teamId, p.user.id, parsed.data);
    return NextResponse.json({ mission }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo crear la misión.' }, { status: 422 });
  }
}
