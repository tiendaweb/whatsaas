import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { listDevPrompts, upsertDevPrompt } from '@/lib/plugins/dev-center/server/prompts';
import { MISSION_AGENTS, MISSION_MODES } from '@/lib/plugins/dev-center/shared/types';

export const dynamic = 'force-dynamic';

export const promptSchema = z.object({
  key: z.string().trim().min(2).max(64).regex(/^[a-z0-9._-]+$/).optional(),
  title: z.string().trim().min(2).max(160),
  body: z.string().min(5).max(20000),
  description: z.string().max(2000).nullable().optional(),
  agentDefault: z.enum(MISSION_AGENTS).optional(),
  projectDefault: z.string().max(40).nullable().optional(),
  modeDefault: z.enum(MISSION_MODES).optional(),
  variables: z.array(z.object({ key: z.string().regex(/^[a-zA-Z0-9_]+$/).max(40), label: z.string().max(80), placeholder: z.string().max(160).optional() })).max(12).optional(),
  pinned: z.boolean().optional(),
});

export async function GET() {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  return NextResponse.json({ prompts: await listDevPrompts(p.teamId) });
}

export async function POST(request: NextRequest) {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const parsed = promptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'El prompt tiene campos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json({ prompt: await upsertDevPrompt(p.teamId, p.user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo guardar el prompt.' }, { status: 422 });
  }
}
