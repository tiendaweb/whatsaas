import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleVariations } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  combination: z.record(z.string(), z.string()).optional(),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().int().min(0).optional().nullable(),
  stock: z.number().int().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
  position: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; variationId: string }> },
) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id, variationId } = await params;
  const articleId = parseInt(id, 10);
  const vId = parseInt(variationId, 10);
  if (isNaN(articleId) || isNaN(vId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const vals: Record<string, unknown> = { updatedAt: new Date() };
  if (d.combination !== undefined) vals.combination = d.combination;
  if ('sku' in d) vals.sku = d.sku ?? null;
  if ('price' in d) vals.price = d.price ?? null;
  if ('stock' in d) vals.stock = d.stock ?? null;
  if (d.status !== undefined) vals.status = d.status;
  if (d.position !== undefined) vals.position = d.position;

  const [updated] = await db
    .update(teamArticleVariations)
    .set(vals)
    .where(and(
      eq(teamArticleVariations.id, vId),
      eq(teamArticleVariations.articleId, articleId),
      eq(teamArticleVariations.teamId, ctx.team.id),
    ))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; variationId: string }> },
) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id, variationId } = await params;
  const articleId = parseInt(id, 10);
  const vId = parseInt(variationId, 10);
  if (isNaN(articleId) || isNaN(vId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamArticleVariations)
    .where(and(
      eq(teamArticleVariations.id, vId),
      eq(teamArticleVariations.articleId, articleId),
      eq(teamArticleVariations.teamId, ctx.team.id),
    ))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
