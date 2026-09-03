import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticles } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  sku: z.string().max(100).optional().nullable(),
  articleTypeId: z.number().int().optional().nullable(),
  price: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  category: z.string().max(100).optional().nullable(),
  unit: z.string().max(50).optional(),
  stock: z.number().int().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  customFieldValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  attributeIds: z.array(z.number().int()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const article = await db.query.teamArticles.findFirst({
    where: and(eq(teamArticles.id, articleId), eq(teamArticles.teamId, ctx.team.id)),
    with: {
      articleType: { with: { customFields: true } },
      variations: true,
      plans: true,
    },
  });

  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(article);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const vals: Record<string, unknown> = { updatedBy: ctx.user.id, updatedAt: new Date() };
  if (d.name !== undefined) vals.name = d.name;
  if (d.description !== undefined) vals.description = d.description;
  if ('sku' in d) vals.sku = d.sku ?? null;
  if ('articleTypeId' in d) vals.articleTypeId = d.articleTypeId ?? null;
  if (d.price !== undefined) vals.price = d.price;
  if (d.currency !== undefined) vals.currency = d.currency;
  if ('category' in d) vals.category = d.category ?? null;
  if (d.unit !== undefined) vals.unit = d.unit;
  if ('stock' in d) vals.stock = d.stock ?? null;
  if ('imageUrl' in d) vals.imageUrl = d.imageUrl ?? null;
  if (d.tags !== undefined) vals.tags = d.tags;
  if (d.customFieldValues !== undefined) vals.customFieldValues = d.customFieldValues;
  if (d.attributeIds !== undefined) vals.attributeIds = d.attributeIds;
  if (d.status !== undefined) vals.status = d.status;

  const [updated] = await db
    .update(teamArticles)
    .set(vals)
    .where(and(eq(teamArticles.id, articleId), eq(teamArticles.teamId, ctx.team.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamArticles)
    .where(and(eq(teamArticles.id, articleId), eq(teamArticles.teamId, ctx.team.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
