import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticlePlans } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { BILLING_MODES } from '@/lib/plugins/articles/constants';

export const dynamic = 'force-dynamic';

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    includedItems: z.array(z.string().min(1).max(200)).optional(),
    billingMode: z.enum(BILLING_MODES).optional(),
    billingLabel: z.string().max(100).optional().nullable(),
    price: z.number().int().min(0).optional(),
    currency: z.string().length(3).optional(),
    companyName: z.string().max(200).optional().nullable(),
    status: z.enum(['active', 'inactive']).optional(),
    position: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.billingMode === 'custom' && data.billingLabel !== undefined && !data.billingLabel?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['billingLabel'], message: 'La etiqueta es requerida cuando el modo de cobro es "Otro".' });
    }
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id, planId } = await params;
  const articleId = parseInt(id, 10);
  const pId = parseInt(planId, 10);
  if (isNaN(articleId) || isNaN(pId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const vals: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) vals.name = d.name;
  if (d.description !== undefined) vals.description = d.description;
  if (d.includedItems !== undefined) vals.includedItems = d.includedItems;
  if (d.billingMode !== undefined) {
    vals.billingMode = d.billingMode;
    vals.billingLabel = d.billingMode === 'custom' ? d.billingLabel ?? null : null;
  } else if (d.billingLabel !== undefined) {
    vals.billingLabel = d.billingLabel ?? null;
  }
  if (d.price !== undefined) vals.price = d.price;
  if (d.currency !== undefined) vals.currency = d.currency;
  if ('companyName' in d) vals.companyName = d.companyName || null;
  if (d.status !== undefined) vals.status = d.status;
  if (d.position !== undefined) vals.position = d.position;

  const [updated] = await db
    .update(teamArticlePlans)
    .set(vals)
    .where(and(
      eq(teamArticlePlans.id, pId),
      eq(teamArticlePlans.articleId, articleId),
      eq(teamArticlePlans.teamId, ctx.team.id),
    ))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id, planId } = await params;
  const articleId = parseInt(id, 10);
  const pId = parseInt(planId, 10);
  if (isNaN(articleId) || isNaN(pId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamArticlePlans)
    .where(and(
      eq(teamArticlePlans.id, pId),
      eq(teamArticlePlans.articleId, articleId),
      eq(teamArticlePlans.teamId, ctx.team.id),
    ))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
