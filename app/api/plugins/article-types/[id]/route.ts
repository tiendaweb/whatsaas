import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleTypes } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { ARTICLE_KINDS, BILLING_MODES } from '@/lib/plugins/articles/constants';

export const dynamic = 'force-dynamic';

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    kind: z.enum(ARTICLE_KINDS).optional(),
    billingMode: z.enum(BILLING_MODES).optional(),
    billingLabel: z.string().max(100).optional().nullable(),
    tracksStock: z.boolean().optional(),
    position: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.billingMode === 'custom' && data.billingLabel !== undefined && !data.billingLabel?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['billingLabel'],
        message: 'La etiqueta es requerida cuando el modo de cobro es "Otro".',
      });
    }
  });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const typeId = parseInt(id, 10);
  if (isNaN(typeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const vals: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name !== undefined) vals.name = d.name;
  if (d.kind !== undefined) vals.kind = d.kind;
  if (d.billingMode !== undefined) {
    vals.billingMode = d.billingMode;
    vals.billingLabel = d.billingMode === 'custom' ? d.billingLabel ?? null : null;
  } else if (d.billingLabel !== undefined) {
    vals.billingLabel = d.billingLabel ?? null;
  }
  if (d.tracksStock !== undefined) vals.tracksStock = d.tracksStock;
  if (d.position !== undefined) vals.position = d.position;

  try {
    const [updated] = await db
      .update(teamArticleTypes)
      .set(vals)
      .where(and(eq(teamArticleTypes.id, typeId), eq(teamArticleTypes.teamId, ctx.team.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un tipo de artículo con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const typeId = parseInt(id, 10);
  if (isNaN(typeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [deleted] = await db
    .delete(teamArticleTypes)
    .where(and(eq(teamArticleTypes.id, typeId), eq(teamArticleTypes.teamId, ctx.team.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
