import { NextRequest, NextResponse } from 'next/server';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { listDevPrompts, upsertDevPrompt } from '@/lib/plugins/dev-center/server/prompts';
import { promptSchema } from '@/lib/plugins/dev-center/shared/prompt-schema';

export const dynamic = 'force-dynamic';

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
