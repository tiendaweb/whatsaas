import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { metaAdsTokens } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { validateAdsToken } from '@/lib/ads/meta-ads';
import { discoverAndUpsertAccounts } from '@/lib/ads/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const replaceSchema = z.object({ token: z.string().trim().min(20) });

/** Reemplaza un token vencido: revalida, reactiva y vuelve a descubrir sus cuentas. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('metaAdsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });

  const parsed = replaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });

  const [existing] = await db
    .select({ id: metaAdsTokens.id })
    .from(metaAdsTokens)
    .where(and(eq(metaAdsTokens.id, id), eq(metaAdsTokens.teamId, ctx.team.id)))
    .limit(1);

  if (!existing) return NextResponse.json({ error: 'El token no existe.' }, { status: 404 });

  try {
    await validateAdsToken(parsed.data.token);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo validar el token.';
    return NextResponse.json({ error: `Meta rechazó el token: ${message}` }, { status: 400 });
  }

  await db
    .update(metaAdsTokens)
    .set({
      token: parsed.data.token,
      status: 'active',
      lastError: null,
      lastValidatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(metaAdsTokens.id, id));

  const accounts = await discoverAndUpsertAccounts(ctx.team.id, id, parsed.data.token);

  return NextResponse.json({ ok: true, accounts: accounts.length });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('metaAdsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });

  // Cascade: borra también cuentas, campañas e histórico. La UI lo advierte.
  const [deleted] = await db
    .delete(metaAdsTokens)
    .where(and(eq(metaAdsTokens.id, id), eq(metaAdsTokens.teamId, ctx.team.id)))
    .returning({ id: metaAdsTokens.id });

  if (!deleted) return NextResponse.json({ error: 'El token no existe.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
