import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticlePlans, teamArticles } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { BILLING_MODES } from '@/lib/plugins/articles/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getOwnedArticle(teamId: number, articleId: number) {
  return db.query.teamArticles.findFirst({
    where: and(eq(teamArticles.id, articleId), eq(teamArticles.teamId, teamId)),
  });
}

const planSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).default(''),
    includedItems: z.array(z.string().min(1).max(200)).default([]),
    billingMode: z.enum(BILLING_MODES).default('monthly'),
    billingLabel: z.string().max(100).optional().nullable(),
    price: z.number().int().min(0).default(0),
    currency: z.string().length(3).default('USD'),
    companyName: z.string().max(200).optional().nullable(),
    status: z.enum(['active', 'inactive']).default('active'),
    position: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.billingMode === 'custom' && !data.billingLabel?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['billingLabel'], message: 'La etiqueta es requerida cuando el modo de cobro es "Otro".' });
    }
  });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const article = await getOwnedArticle(ctx.team.id, articleId);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const plans = await db
    .select()
    .from(teamArticlePlans)
    .where(eq(teamArticlePlans.articleId, articleId))
    .orderBy(asc(teamArticlePlans.position), asc(teamArticlePlans.price));

  return NextResponse.json(plans);
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
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const [created] = await db
    .insert(teamArticlePlans)
    .values({
      teamId: ctx.team.id,
      articleId,
      name: d.name,
      description: d.description,
      includedItems: d.includedItems,
      billingMode: d.billingMode,
      billingLabel: d.billingMode === 'custom' ? d.billingLabel ?? null : null,
      price: d.price,
      currency: d.currency,
      companyName: d.companyName || null,
      status: d.status,
      position: d.position ?? 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
