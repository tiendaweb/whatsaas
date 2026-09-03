import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { hostingerAccounts } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { validateHostingerToken } from '@/lib/hostinger/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const createAccountSchema = z.object({
  label: z.string().trim().min(1).max(120),
  token: z.string().trim().min(20),
});

/** El token nunca vuelve al browser: sólo los últimos 4 caracteres, para poder distinguirlos. */
function maskToken(token: string): string {
  return `••••${token.slice(-4)}`;
}

export async function GET() {
  const ctx = await getPluginRequestContext('hostingerRead');
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  }

  const accounts = await db
    .select()
    .from(hostingerAccounts)
    .where(eq(hostingerAccounts.teamId, ctx.team.id))
    .orderBy(asc(hostingerAccounts.createdAt));

  return NextResponse.json(
    accounts.map((account) => ({
      id: account.id,
      label: account.label,
      tokenPreview: maskToken(account.token),
      status: account.status,
      lastError: account.lastError,
      lastSyncedAt: account.lastSyncedAt,
      domainsCount: account.domainsCount,
      createdAt: account.createdAt,
    })),
  );
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('hostingerWrite');
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  }

  const parsed = createAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Nombre o token inválido.' }, { status: 400 });
  }

  let domains: number;
  try {
    ({ domains } = await validateHostingerToken(parsed.data.token));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo validar el token.';
    return NextResponse.json({ error: `Hostinger rechazó el token: ${message}` }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(hostingerAccounts)
      .values({
        teamId: ctx.team.id,
        label: parsed.data.label,
        token: parsed.data.token,
        status: 'connected',
        domainsCount: domains,
        connectedBy: ctx.user.id,
      })
      .returning();

    return NextResponse.json(
      { id: created.id, label: created.label, tokenPreview: maskToken(created.token), domainsCount: domains },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('hostinger_accounts_team_label_uidx')) {
      return NextResponse.json({ error: 'Ya tenés una cuenta con ese nombre.' }, { status: 409 });
    }
    throw error;
  }
}
