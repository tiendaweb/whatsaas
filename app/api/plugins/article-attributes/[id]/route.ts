import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleAttributes } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  values: z.array(z.string().min(1).max(100)).optional(),
  position: z.number().int().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const attrId = parseInt(id, 10);
  if (isNaN(attrId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const vals: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) vals.name = d.name;
  if (d.values !== undefined) vals.values = d.values;
  if (d.position !== undefined) vals.position = d.position;

  try {
    const [updated] = await db
      .update(teamArticleAttributes)
      .set(vals)
      .where(and(eq(teamArticleAttributes.id, attrId), eq(teamArticleAttributes.teamId, ctx.team.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un atributo con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const attrId = parseInt(id, 10);
  if (isNaN(attrId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamArticleAttributes)
    .where(and(eq(teamArticleAttributes.id, attrId), eq(teamArticleAttributes.teamId, ctx.team.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
