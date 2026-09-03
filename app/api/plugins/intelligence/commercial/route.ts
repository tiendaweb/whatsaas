import { NextResponse } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, funnelStages, teamSaleCommissions, teamSales, users } from '@/lib/db/schema';
import { getIntelligenceRequestContext } from '@/lib/plugins/intelligence/server/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getIntelligenceRequestContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const teamId = ctx.team.id;
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [leadsCreated, funnelStock, salesByStatus, bySeller] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(contacts)
      .where(and(eq(contacts.teamId, teamId), gte(contacts.createdAt, startOfMonth))),
    db.select({
        stageId: funnelStages.id,
        stageName: funnelStages.name,
        stageEmoji: funnelStages.emoji,
        stageOrder: funnelStages.order,
        count: sql<number>`count(${contacts.id})`,
      })
      .from(funnelStages)
      .leftJoin(contacts, and(eq(contacts.funnelStageId, funnelStages.id), eq(contacts.teamId, teamId)))
      .where(eq(funnelStages.teamId, teamId))
      .groupBy(funnelStages.id, funnelStages.name, funnelStages.emoji, funnelStages.order)
      .orderBy(funnelStages.order),
    db.select({
        status: teamSales.status,
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${teamSales.total}), 0)`,
      })
      .from(teamSales)
      .where(and(eq(teamSales.teamId, teamId), gte(teamSales.createdAt, startOfMonth)))
      .groupBy(teamSales.status),
    // Proxy de atribución: comisiones ya registradas (Fase 2 RRHH). No es atribución real
    // de venta (no todas las ventas tienen comisión cargada), solo lo que hay disponible hoy.
    ctx.activePluginIds.has('hr')
      ? db.select({
          userId: teamSaleCommissions.userId,
          userName: users.name,
          userEmail: users.email,
          count: sql<number>`count(*)`,
          total: sql<number>`coalesce(sum(${teamSaleCommissions.basisAmount}), 0)`,
        })
        .from(teamSaleCommissions)
        .innerJoin(users, eq(users.id, teamSaleCommissions.userId))
        .where(eq(teamSaleCommissions.teamId, teamId))
        .groupBy(teamSaleCommissions.userId, users.name, users.email)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    leadsCreatedThisMonth: Number(leadsCreated[0]?.count ?? 0),
    funnelStock: funnelStock.map((row) => ({
      stageId: row.stageId,
      stageName: row.stageName,
      stageEmoji: row.stageEmoji,
      count: Number(row.count ?? 0),
    })),
    salesByStatusThisMonth: salesByStatus.map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0),
      total: Number(row.total ?? 0),
    })),
    bySeller: bySeller
      ? {
          available: true,
          rows: bySeller.map((row) => ({
            userId: row.userId,
            userName: row.userName ?? row.userEmail,
            count: Number(row.count ?? 0),
            total: Number(row.total ?? 0),
          })),
        }
      : { available: false, rows: [] },
  });
}
