import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleAttributes, teamArticleVariations, teamArticles } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getOwnedArticle(teamId: number, articleId: number) {
  return db.query.teamArticles.findFirst({
    where: and(eq(teamArticles.id, articleId), eq(teamArticles.teamId, teamId)),
  });
}

const createSchema = z.object({
  combination: z.record(z.string(), z.string()).default({}),
  sku: z.string().max(100).optional().nullable(),
  price: z.number().int().min(0).optional().nullable(),
  stock: z.number().int().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const generateSchema = z.object({
  action: z.literal('generate'),
  attributeIds: z.array(z.number().int()).min(1),
});

function cartesianProduct(entries: { name: string; values: string[] }[]): Record<string, string>[] {
  return entries.reduce<Record<string, string>[]>(
    (acc, entry) => acc.flatMap(combo => entry.values.map(value => ({ ...combo, [entry.name]: value }))),
    [{}],
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const article = await getOwnedArticle(ctx.team.id, articleId);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const variations = await db
    .select()
    .from(teamArticleVariations)
    .where(eq(teamArticleVariations.articleId, articleId))
    .orderBy(asc(teamArticleVariations.position), asc(teamArticleVariations.id));

  return NextResponse.json(variations);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const article = await getOwnedArticle(ctx.team.id, articleId);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  const existing = await db
    .select()
    .from(teamArticleVariations)
    .where(eq(teamArticleVariations.articleId, articleId));

  if (body?.action === 'generate') {
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const attributes = await db
      .select()
      .from(teamArticleAttributes)
      .where(and(eq(teamArticleAttributes.teamId, ctx.team.id), inArray(teamArticleAttributes.id, parsed.data.attributeIds)));

    const entries = attributes
      .filter(a => a.values.length > 0)
      .map(a => ({ name: a.name, values: a.values }));

    if (entries.length === 0) return NextResponse.json([]);

    const combos = cartesianProduct(entries);
    const existingKeys = new Set(existing.map(v => JSON.stringify(v.combination)));
    const toCreate = combos.filter(combo => !existingKeys.has(JSON.stringify(combo)));

    if (toCreate.length === 0) return NextResponse.json([]);

    const created = await db
      .insert(teamArticleVariations)
      .values(toCreate.map((combination, i) => ({
        teamId: ctx.team.id,
        articleId,
        combination,
        position: existing.length + i,
      })))
      .returning();

    return NextResponse.json(created, { status: 201 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const [created] = await db
    .insert(teamArticleVariations)
    .values({
      teamId: ctx.team.id,
      articleId,
      combination: d.combination,
      sku: d.sku ?? null,
      price: d.price ?? null,
      stock: d.stock ?? null,
      status: d.status,
      position: existing.length,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
