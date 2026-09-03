import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamAappConnections } from '@/lib/db/schema';
import { syncTeamAapp } from '@/lib/aapp/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const connections = await db.query.teamAappConnections.findMany({ where: eq(teamAappConnections.status, 'connected') });
  const results = [];
  for (const connection of connections) {
    try {
      results.push({ teamId: connection.teamId, ok: true, summary: await syncTeamAapp(connection.teamId, connection.apiKey) });
    } catch (error) {
      results.push({ teamId: connection.teamId, ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  return NextResponse.json({ ok: results.every((item) => item.ok), teams: results.length, results });
}
