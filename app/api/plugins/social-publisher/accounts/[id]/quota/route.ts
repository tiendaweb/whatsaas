import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { socialAccounts } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { getIgPublishingLimit } from '@/lib/social/meta-graph';

export const dynamic = 'force-dynamic';

// Cuota de publicación por API de Instagram (límite de Meta: 50 posts/24h por cuenta)
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('socialPublisherRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await context.params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const account = await db.query.socialAccounts.findFirst({
    where: and(
      eq(socialAccounts.id, accountId),
      eq(socialAccounts.teamId, ctx.team.id),
      eq(socialAccounts.platform, 'instagram'),
    ),
  });
  if (!account) return NextResponse.json({ error: 'Cuenta de Instagram no encontrada' }, { status: 404 });

  try {
    const quota = await getIgPublishingLimit(account.externalId, account.accessToken);
    return NextResponse.json(quota);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
