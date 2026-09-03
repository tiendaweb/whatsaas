import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleCustomFields } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { CUSTOM_FIELD_TYPES } from '@/lib/plugins/articles/constants';

export const dynamic = 'force-dynamic';

const optionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(100),
  priceModifier: z.number().int().default(0),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(CUSTOM_FIELD_TYPES).optional(),
  required: z.boolean().optional(),
  hasPrice: z.boolean().optional(),
  price: z.number().int().optional(),
  options: z.array(optionSchema).optional(),
  position: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id, fieldId } = await params;
  const typeId = parseInt(id, 10);
  const fid = parseInt(fieldId, 10);
  if (isNaN(typeId) || isNaN(fid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const vals: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) vals.name = d.name;
  if (d.type !== undefined) vals.type = d.type;
  if (d.required !== undefined) vals.required = d.required;
  if (d.hasPrice !== undefined) vals.hasPrice = d.hasPrice;
  if (d.price !== undefined) vals.price = d.price;
  if (d.options !== undefined) vals.options = d.options;
  if (d.position !== undefined) vals.position = d.position;

  const [updated] = await db
    .update(teamArticleCustomFields)
    .set(vals)
    .where(and(
      eq(teamArticleCustomFields.id, fid),
      eq(teamArticleCustomFields.articleTypeId, typeId),
      eq(teamArticleCustomFields.teamId, ctx.team.id),
    ))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id, fieldId } = await params;
  const typeId = parseInt(id, 10);
  const fid = parseInt(fieldId, 10);
  if (isNaN(typeId) || isNaN(fid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamArticleCustomFields)
    .where(and(
      eq(teamArticleCustomFields.id, fid),
      eq(teamArticleCustomFields.articleTypeId, typeId),
      eq(teamArticleCustomFields.teamId, ctx.team.id),
    ))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
