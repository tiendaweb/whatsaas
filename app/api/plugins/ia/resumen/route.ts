import { NextResponse } from 'next/server';
import { getIaContext } from '@/lib/plugins/ia/server/access';
import { getResumenIa } from '@/lib/plugins/ia/server/resumen';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getIaContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await getResumenIa(ctx.team.id, ctx.user.id));
}
