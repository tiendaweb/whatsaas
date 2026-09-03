import { NextResponse } from 'next/server';
import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamAappConnections, teamCustomers, teamCustomerStores, teamCustomerTransactions } from '@/lib/db/schema';
import { aappFetch } from '@/lib/aapp/client';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getPluginRequestContext('aappSpaceRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const connection = await db.query.teamAappConnections.findFirst({ where: eq(teamAappConnections.teamId, ctx.team.id) });
  const [[customers], [stores], [transactions]] = await Promise.all([
    db.select({ value: count() }).from(teamCustomers).where(eq(teamCustomers.teamId, ctx.team.id)),
    db.select({ value: count() }).from(teamCustomerStores).where(eq(teamCustomerStores.teamId, ctx.team.id)),
    db.select({ value: count() }).from(teamCustomerTransactions).where(eq(teamCustomerTransactions.teamId, ctx.team.id)),
  ]);
  return NextResponse.json({
    connected: connection?.status === 'connected', status: connection?.status ?? 'disconnected', hasApiKey: Boolean(connection?.apiKey),
    lastSyncedAt: connection?.lastSyncedAt ?? null, lastSyncStatus: connection?.lastSyncStatus ?? null,
    lastSyncError: connection?.lastSyncError ?? null, counts: { customers: Number(customers.value), stores: Number(stores.value), transactions: Number(transactions.value) },
  });
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('aappSpaceWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = z.object({ apiKey: z.string().trim().startsWith('gbz_').min(8) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'La API key de AAPP SPACE no es válida.' }, { status: 400 });
  try {
    await aappFetch<unknown>(parsed.data.apiKey, '/info');
    await db.insert(teamAappConnections).values({ teamId: ctx.team.id, apiKey: parsed.data.apiKey, status: 'connected', createdBy: ctx.user.id })
      .onConflictDoUpdate({ target: teamAappConnections.teamId, set: { apiKey: parsed.data.apiKey, status: 'connected', lastSyncError: null, updatedAt: new Date() } });
    return NextResponse.json({ ok: true, connected: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo validar la conexión.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const ctx = await getPluginRequestContext('aappSpaceWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  await db.delete(teamAappConnections).where(eq(teamAappConnections.teamId, ctx.team.id));
  return NextResponse.json({ ok: true });
}
