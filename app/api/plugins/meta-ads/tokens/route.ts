import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts, metaAdsTokens } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { validateAdsToken } from '@/lib/ads/meta-ads';
import { discoverAndUpsertAccounts } from '@/lib/ads/sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(120),
  token: z.string().trim().min(20),
});

/** El token nunca vuelve al browser. */
const maskToken = (token: string) => `••••${token.slice(-4)}`;

export async function GET() {
  const ctx = await getPluginRequestContext('metaAdsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const tokens = await db
    .select()
    .from(metaAdsTokens)
    .where(eq(metaAdsTokens.teamId, ctx.team.id))
    .orderBy(asc(metaAdsTokens.createdAt));

  const accounts = await db
    .select({ id: metaAdAccounts.id, tokenId: metaAdAccounts.tokenId })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.teamId, ctx.team.id));

  return NextResponse.json(
    tokens.map((token) => ({
      id: token.id,
      label: token.label,
      tokenPreview: maskToken(token.token),
      status: token.status,
      lastError: token.lastError,
      lastValidatedAt: token.lastValidatedAt,
      accountsCount: accounts.filter((account) => account.tokenId === token.id).length,
    })),
  );
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('metaAdsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = createTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Nombre o token inválido.' }, { status: 400 });
  }

  // Validamos contra Meta ANTES de guardar: un token malo se rechaza en el momento.
  try {
    await validateAdsToken(parsed.data.token);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo validar el token.';
    return NextResponse.json({ error: `Meta rechazó el token: ${message}` }, { status: 400 });
  }

  let tokenRow;
  try {
    [tokenRow] = await db
      .insert(metaAdsTokens)
      .values({
        teamId: ctx.team.id,
        label: parsed.data.label,
        token: parsed.data.token,
        status: 'active',
        lastValidatedAt: new Date(),
        connectedBy: ctx.user.id,
      })
      .returning();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('meta_ads_tokens_team_label_uidx')) {
      return NextResponse.json({ error: 'Ya tenés un token con ese nombre.' }, { status: 409 });
    }
    throw error;
  }

  const accounts = await discoverAndUpsertAccounts(ctx.team.id, tokenRow.id, parsed.data.token);

  return NextResponse.json(
    {
      id: tokenRow.id,
      label: tokenRow.label,
      tokenPreview: maskToken(tokenRow.token),
      accounts: accounts.map((account) => ({ accountId: account.account_id, name: account.name })),
    },
    { status: 201 },
  );
}
