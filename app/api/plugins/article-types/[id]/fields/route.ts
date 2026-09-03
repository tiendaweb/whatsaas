import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleCustomFields, teamArticleTypes } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { CUSTOM_FIELD_TYPES } from '@/lib/plugins/articles/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function buildFieldKey(name: string, existingKeys: Set<string>) {
  const base = name
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'campo';
  let key = base;
  let i = 1;
  while (existingKeys.has(key)) {
    key = `${base}_${i}`;
    i += 1;
  }
  return key;
}

const optionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(100),
  priceModifier: z.number().int().default(0),
});

const fieldSchema = z
  .object({
    name: z.string().min(1).max(100),
    type: z.enum(CUSTOM_FIELD_TYPES).default('text'),
    required: z.boolean().default(false),
    hasPrice: z.boolean().default(false),
    price: z.number().int().default(0),
    options: z.array(optionSchema).default([]),
    position: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'select' && data.options.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Agrega al menos una opción.' });
    }
    if (data.hasPrice && data.type !== 'boolean' && data.type !== 'select') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hasPrice'], message: 'El precio solo aplica a campos Sí/No o de Selección.' });
    }
  });

async function getOwnedType(teamId: number, typeId: number) {
  return db.query.teamArticleTypes.findFirst({
    where: and(eq(teamArticleTypes.id, typeId), eq(teamArticleTypes.teamId, teamId)),
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const typeId = parseInt(id, 10);
  if (isNaN(typeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const type = await getOwnedType(ctx.team.id, typeId);
  if (!type) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fields = await db
    .select()
    .from(teamArticleCustomFields)
    .where(eq(teamArticleCustomFields.articleTypeId, typeId))
    .orderBy(asc(teamArticleCustomFields.position), asc(teamArticleCustomFields.name));

  return NextResponse.json(fields);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const typeId = parseInt(id, 10);
  if (isNaN(typeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const type = await getOwnedType(ctx.team.id, typeId);
  if (!type) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const parsed = fieldSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await db
    .select({ key: teamArticleCustomFields.key })
    .from(teamArticleCustomFields)
    .where(eq(teamArticleCustomFields.articleTypeId, typeId));
  const key = buildFieldKey(parsed.data.name, new Set(existing.map(e => e.key)));

  const d = parsed.data;
  const [created] = await db
    .insert(teamArticleCustomFields)
    .values({
      teamId: ctx.team.id,
      articleTypeId: typeId,
      name: d.name,
      key,
      type: d.type,
      required: d.required,
      hasPrice: d.hasPrice,
      price: d.hasPrice ? d.price : 0,
      options: d.type === 'select' ? d.options : [],
      position: d.position ?? existing.length,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
