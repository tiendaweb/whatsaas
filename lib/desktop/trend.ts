import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamSales } from '@/lib/db/schema';

export type TrendPoint = { month: string; revenue: number; target: number };

/**
 * Ingresos mes a mes contra un objetivo.
 *
 * 🚨 `date_trunc('month', …)` va LITERAL dentro del template. Pasar el intervalo
 * como parámetro (`date_trunc($1, …)`) compila, pasa el build y explota en
 * runtime al armar el GROUP BY. Ya costó una sesión; no cambiar por "parametrizar".
 */
export async function revenueTrend(teamId: number, months = 6): Promise<TrendPoint[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - (months - 1));
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${teamSales.paidAt}), 'YYYY-MM')`,
      revenue: sql<number>`COALESCE(SUM(${teamSales.total}), 0)`,
    })
    .from(teamSales)
    .where(
      and(
        eq(teamSales.teamId, teamId),
        eq(teamSales.status, 'paid'),
        gte(teamSales.paidAt, from),
      ),
    )
    .groupBy(sql`date_trunc('month', ${teamSales.paidAt})`)
    .orderBy(sql`date_trunc('month', ${teamSales.paidAt})`);

  const byMonth = new Map(rows.map((row) => [row.month, Number(row.revenue) || 0]));

  // Se emiten los `months` meses completos aunque no haya ventas: un gráfico que
  // salta de marzo a junio miente sobre la tendencia.
  const series: TrendPoint[] = [];
  const cursor = new Date(from);
  for (let i = 0; i < months; i += 1) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    series.push({ month: key, revenue: byMonth.get(key) ?? 0, target: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Objetivo: media móvil de los 3 meses previos. Es un sustituto explícito
  // mientras no haya presupuesto cargado en `team_budgets` — no una proyección.
  for (let i = 0; i < series.length; i += 1) {
    const window = series.slice(Math.max(0, i - 3), i).map((point) => point.revenue);
    series[i].target = window.length
      ? Math.round(window.reduce((sum, value) => sum + value, 0) / window.length)
      : series[i].revenue;
  }

  return series;
}
