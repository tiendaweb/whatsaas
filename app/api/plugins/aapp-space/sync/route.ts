import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamAappConnections } from '@/lib/db/schema';
import { syncTeamAapp } from '@/lib/aapp/sync';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const ctx = await getPluginRequestContext('aappSpaceWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const connection = await db.query.teamAappConnections.findFirst({ where: eq(teamAappConnections.teamId, ctx.team.id) });
  if (!connection?.apiKey) return NextResponse.json({ error: 'Conecta AAPP SPACE antes de sincronizar.' }, { status: 409 });
  try {
    const summary = await syncTeamAapp(ctx.team.id, connection.apiKey);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error de sincronización' }, { status: 502 });
  }
}
