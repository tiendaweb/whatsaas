import { NextResponse } from 'next/server';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { listDevPrompts, seedDevPrompts } from '@/lib/plugins/dev-center/server/prompts';

export const dynamic = 'force-dynamic';

/** Carga los prompts iniciales. Idempotente: lo que ya existe (aunque esté editado) no se pisa. */
export async function POST() {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  const resultado = await seedDevPrompts(p.teamId, p.user.id);
  return NextResponse.json({ ...resultado, prompts: await listDevPrompts(p.teamId) });
}
