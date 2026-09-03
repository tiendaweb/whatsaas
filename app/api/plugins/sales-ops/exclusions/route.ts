import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { EXCLUSION_KINDS, countExclusionsByKind, excludeChats, includeChats, isExclusionKind, listExclusions } from '@/lib/plugins/sales-ops/server/exclusions';

export const dynamic = 'force-dynamic';

/** GET ?kind=personal|equipo|otros → chats ignorados + conteo por grupo. */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const kind = new URL(request.url).searchParams.get('kind');
  try {
    const [rows, counts] = await Promise.all([
      listExclusions(ctx.team.id, { kind: isExclusionKind(kind) ? kind : undefined }),
      countExclusionsByKind(ctx.team.id),
    ]);
    return NextResponse.json({ rows, counts, kinds: EXCLUSION_KINDS });
  } catch (error) {
    console.error('[sales-ops/exclusions]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const postSchema = z.object({
  chatIds: z.array(z.number().int().positive()).min(1).max(500),
  kind: z.enum(EXCLUSION_KINDS),
  reason: z.string().max(300).nullable().optional(),
});

/** POST → marca chats como ignorados (y limpia audios encolados y señales sin atender). */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { chatIds, kind, reason? }' }, { status: 400 });
  try {
    return NextResponse.json(await excludeChats(ctx.team.id, ctx.user.id, parsed.data.chatIds, parsed.data.kind, parsed.data.reason ?? null));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

const deleteSchema = z.object({ chatIds: z.array(z.number().int().positive()).min(1).max(500) });

/** DELETE → devuelve los chats al circuito comercial. */
export async function DELETE(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { chatIds }' }, { status: 400 });
  return NextResponse.json({ included: await includeChats(ctx.team.id, ctx.user.id, parsed.data.chatIds) });
}
