import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamAappConnections } from '@/lib/db/schema';
import { syncTeamAapp } from '@/lib/aapp/sync';
import { getAappRenewalRequestContext } from '@/lib/plugins/scheduled-messages/aapp-renewal-access';
import {
  auditAappRenewal,
  materializeAappRenewalCandidates,
  refreshAappStorePhones,
} from '@/lib/plugins/scheduled-messages/aapp-renewals';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const ctx = await getAappRenewalRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const connection = await db.query.teamAappConnections.findFirst({ where: eq(teamAappConnections.teamId, ctx.team.id) });
  if (!connection?.apiKey) return NextResponse.json({ error: 'AAPP Space is not connected' }, { status: 409 });
  try {
    const sync = await syncTeamAapp(ctx.team.id, connection.apiKey);
    const phones = await refreshAappStorePhones(ctx.team.id);
    const queue = await materializeAappRenewalCandidates(ctx.team.id, ctx.user.id, { refreshPending: true });
    await auditAappRenewal(ctx.team.id, ctx.user.id, 'refreshed', { sync, phones, queue });
    return NextResponse.json({ ok: true, sync, phones, queue });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AAPP Space refresh failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
