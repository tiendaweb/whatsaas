import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleTypes } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { ARTICLE_KINDS, BILLING_MODES } from '@/lib/plugins/articles/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const articleTypeSchema = z
  .object({
    name: z.string().min(1).max(100),
    kind: z.enum(ARTICLE_KINDS).default('physical'),
    billingMode: z.enum(BILLING_MODES).default('one_time'),
    billingLabel: z.string().max(100).optional().nullable(),
    tracksStock: z.boolean().default(true),
    position: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.billingMode === 'custom' && !data.billingLabel?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['billingLabel'],
        message: 'La etiqueta es requerida cuando el modo de cobro es "Otro".',
      });
    }
  });

const DEFAULT_TYPES = [
  { name: 'Producto físico', kind: 'physical' as const, billingMode: 'one_time' as const, tracksStock: true, position: 0 },
  { name: 'Producto digital', kind: 'digital' as const, billingMode: 'one_time' as const, tracksStock: false, position: 1 },
  { name: 'Membresía', kind: 'membership' as const, billingMode: 'monthly' as const, tracksStock: false, position: 2 },
  { name: 'Servicio', kind: 'service' as const, billingMode: 'one_time' as const, tracksStock: false, position: 3 },
];

export async function GET() {
  const ctx = await getPluginRequestContext('articlesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  let types = await db
    .select()
    .from(teamArticleTypes)
    .where(eq(teamArticleTypes.teamId, ctx.team.id))
    .orderBy(asc(teamArticleTypes.position), asc(teamArticleTypes.name));

  if (types.length === 0) {
    types = await db
      .insert(teamArticleTypes)
      .values(DEFAULT_TYPES.map((t) => ({ ...t, teamId: ctx.team.id })))
      .returning();
    types.sort((a, b) => a.position - b.position);
  }

  return NextResponse.json(types);
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = articleTypeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  try {
    const [created] = await db
      .insert(teamArticleTypes)
      .values({
        teamId: ctx.team.id,
        name: d.name,
        kind: d.kind,
        billingMode: d.billingMode,
        billingLabel: d.billingMode === 'custom' ? d.billingLabel ?? null : null,
        tracksStock: d.tracksStock,
        position: d.position ?? 0,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un tipo de artículo con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}
