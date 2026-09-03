import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamArticleAttributes } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const attributeSchema = z.object({
  name: z.string().min(1).max(100),
  values: z.array(z.string().min(1).max(100)).default([]),
  position: z.number().int().optional(),
});

export async function GET() {
  const ctx = await getPluginRequestContext('articlesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const attributes = await db
    .select()
    .from(teamArticleAttributes)
    .where(eq(teamArticleAttributes.teamId, ctx.team.id))
    .orderBy(asc(teamArticleAttributes.position), asc(teamArticleAttributes.name));

  return NextResponse.json(attributes);
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('articlesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = attributeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  try {
    const [created] = await db
      .insert(teamArticleAttributes)
      .values({ teamId: ctx.team.id, name: d.name, values: d.values, position: d.position ?? 0 })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un atributo con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}
