import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticles } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const articleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  sku: z.string().max(100).optional().nullable(),
  articleTypeId: z.number().int().optional().nullable(),
  price: z.number().int().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  category: z.string().max(100).optional().nullable(),
  unit: z.string().max(50).default('unidad'),
  stock: z.number().int().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  customFieldValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  attributeIds: z.array(z.number().int()).default([]),
  status: z.enum(['active', 'inactive']).default('active'),
});

export async function GET() {
  const ctx = await getPluginRequestContext('articlesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const articles = await db.query.teamArticles.findMany({
    where: eq(teamArticles.teamId, ctx.team.id),
    orderBy: [asc(teamArticles.category), asc(teamArticles.name)],
    with: { articleType: true },
  });

  return NextResponse.json(articles);
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = articleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const [created] = await db
    .insert(teamArticles)
    .values({
      teamId: ctx.team.id,
      name: d.name,
      description: d.description,
      sku: d.sku ?? null,
      articleTypeId: d.articleTypeId ?? null,
      price: d.price,
      currency: d.currency,
      category: d.category ?? null,
      unit: d.unit,
      stock: d.stock ?? null,
      imageUrl: d.imageUrl ?? null,
      tags: d.tags,
      customFieldValues: d.customFieldValues,
      attributeIds: d.attributeIds,
      status: d.status,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
