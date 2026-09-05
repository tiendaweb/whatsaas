'use client';

import useSWR from 'swr';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PieChart as PieChartIcon, Loader2 } from 'lucide-react';
import { formatMoney as formatMoneySeguro, formatMoneyFromCents } from '@/lib/format/money';

type OverviewData = {
  finance: { incomePaid: number; expensePaid: number; pending: number } | null;
  sales: { count: number; total: number };
  customers: { active: number };
  purchases: { pendingCount: number; pendingTotal: number } | null;
  hr: { pendingCommissions: number } | null;
  support: { open: number; urgent: number } | null;
  contracts: { activeCount: number; activeTotal: number; expiringSoon: number } | null;
};

type TrendData = { available: boolean; months: { month: string; income: number; expense: number }[] };

type CommercialData = {
  leadsCreatedThisMonth: number;
  funnelStock: { stageId: number; stageName: string; stageEmoji: string | null; count: number }[];
  salesByStatusThisMonth: { status: string; count: number; total: number }[];
  bySeller: { available: boolean; rows: { userId: number; userName: string | null; count: number; total: number }[] };
};

type MarketingData = {
  available: boolean;
  byCurrency: { currency: string; spend: number; impressions: number; clicks: number; ctr: number | null; cpc: number | null; cpm: number | null }[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SALE_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  paid: 'Pagada',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
};

function formatMoney(amount: number, currency = 'ARS') {
  return formatMoneyFromCents(amount, currency, { locale: 'es-AR' });
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function UnavailableKpi({ label }: { label: string }) {
  return (
    <Card className="opacity-60">
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">Plugin no activo</p>
      </CardContent>
    </Card>
  );
}

const RoundedBar = (props: any) => {
  const { x, y, width, height, fill } = props;
  if (height <= 0) return null;
  return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} ry={3} />;
};

export function IntelligenceDashboard() {
  const { data: overview } = useSWR<OverviewData>('/api/plugins/intelligence/overview', fetcher);
  const { data: trend } = useSWR<TrendData>('/api/plugins/intelligence/revenue-trend', fetcher);
  const { data: commercial } = useSWR<CommercialData>('/api/plugins/intelligence/commercial', fetcher);
  const { data: marketing } = useSWR<MarketingData>('/api/plugins/intelligence/marketing', fetcher);

  const chartData = (trend?.months ?? []).map((m) => ({
    month: m.month.slice(5),
    Ingresos: m.income / 100,
    Egresos: m.expense / 100,
  }));

  const funnelMax = Math.max(1, ...(commercial?.funnelStock ?? []).map((s) => s.count));

  return (
    <div className="h-full w-full overflow-y-auto">
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center">
          <PieChartIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Inteligencia</h1>
          <p className="text-sm text-muted-foreground">Panel de dirección: un vistazo al negocio.</p>
        </div>
      </div>

      <Tabs defaultValue="direccion">
        <TabsList>
          <TabsTrigger value="direccion">Dirección</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
        </TabsList>

        <TabsContent value="direccion" className="space-y-6 mt-4">
      {!overview ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {overview.finance ? (
              <Kpi
                label="Balance del mes"
                value={formatMoney(overview.finance.incomePaid - overview.finance.expensePaid)}
                detail={`+${formatMoney(overview.finance.incomePaid)} / -${formatMoney(overview.finance.expensePaid)}`}
              />
            ) : (
              <UnavailableKpi label="Balance del mes" />
            )}
            <Kpi label="Ventas pagadas (mes)" value={String(overview.sales.count)} detail={formatMoney(overview.sales.total)} />
            <Kpi label="Clientes activos" value={String(overview.customers.active)} />
            {overview.finance ? (
              <Kpi label="Pendiente de cobro/pago" value={formatMoney(overview.finance.pending)} />
            ) : (
              <UnavailableKpi label="Pendiente de cobro/pago" />
            )}

            {overview.purchases ? (
              <Kpi label="Compras pendientes" value={String(overview.purchases.pendingCount)} detail={formatMoney(overview.purchases.pendingTotal)} />
            ) : (
              <UnavailableKpi label="Compras pendientes" />
            )}
            {overview.hr ? (
              <Kpi label="Comisiones pendientes" value={formatMoney(overview.hr.pendingCommissions)} />
            ) : (
              <UnavailableKpi label="Comisiones pendientes" />
            )}
            {overview.support ? (
              <Kpi label="Tickets abiertos" value={String(overview.support.open)} detail={overview.support.urgent ? `${overview.support.urgent} urgente(s)` : undefined} />
            ) : (
              <UnavailableKpi label="Tickets abiertos" />
            )}
            {overview.contracts ? (
              <Kpi
                label="Contratos activos"
                value={String(overview.contracts.activeCount)}
                detail={overview.contracts.expiringSoon ? `${overview.contracts.expiringSoon} vencen en 30 días` : formatMoney(overview.contracts.activeTotal)}
              />
            ) : (
              <UnavailableKpi label="Contratos activos" />
            )}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Ingresos vs egresos — últimos 6 meses</CardTitle></CardHeader>
            <CardContent>
              {!trend ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : !trend.available ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Activá el plugin Financiero para ver esta tendencia.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#E5E7EB" strokeOpacity={0.5} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" width={40} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', fontSize: 12 }}
                        formatter={(value?: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value ?? 0)}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Ingresos" fill="#2a78d6" shape={RoundedBar} />
                      <Bar dataKey="Egresos" fill="#eb6834" shape={RoundedBar} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
        </TabsContent>

        <TabsContent value="comercial" className="space-y-6 mt-4">
          {!commercial ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Kpi label="Leads creados (mes)" value={String(commercial.leadsCreatedThisMonth)} />
                {commercial.salesByStatusThisMonth.map((row) => (
                  <Kpi
                    key={row.status}
                    label={`Ventas ${SALE_STATUS_LABEL[row.status] ?? row.status} (mes)`}
                    value={String(row.count)}
                    detail={formatMoney(row.total)}
                  />
                ))}
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Contactos por etapa del embudo</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {commercial.funnelStock.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No hay etapas de embudo configuradas.</p>
                  ) : (
                    commercial.funnelStock.map((stage) => (
                      <div key={stage.stageId} className="flex items-center gap-3">
                        <span className="text-sm w-40 truncate flex-shrink-0">{stage.stageEmoji} {stage.stageName}</span>
                        <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                          <div
                            className="h-full rounded-sm"
                            style={{ width: `${(stage.count / funnelMax) * 100}%`, backgroundColor: '#2a78d6' }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{stage.count}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ventas por vendedor</CardTitle>
                </CardHeader>
                <CardContent>
                  {!commercial.bySeller.available ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Activá el plugin RRHH para ver esta métrica.</p>
                  ) : commercial.bySeller.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Todavía no hay comisiones registradas.</p>
                  ) : (
                    <div className="space-y-2">
                      {commercial.bySeller.rows.map((row) => (
                        <div key={row.userId} className="flex items-center justify-between text-sm">
                          <span>{row.userName}</span>
                          <span className="text-muted-foreground">{row.count} venta(s) · {formatMoney(row.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground pt-3">
                    Basado en comisiones registradas en RRHH, no en atribución real de venta — puede no cubrir todas las ventas.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="marketing" className="space-y-6 mt-4">
          {!marketing ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !marketing.available ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Activá el plugin Meta Ads para ver esta métrica.</p>
          ) : marketing.byCurrency.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin inversión registrada este mes.</p>
          ) : (
            <div className="space-y-4">
              {marketing.byCurrency.map((row) => (
                <Card key={row.currency}>
                  <CardHeader><CardTitle className="text-base">Inversión en {row.currency} (mes)</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Gasto</p>
                      <p className="text-lg font-semibold tabular-nums">{formatMoney(row.spend * 100, row.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CTR</p>
                      <p className="text-lg font-semibold tabular-nums">{row.ctr !== null ? `${row.ctr.toFixed(2)}%` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CPC</p>
                      <p className="text-lg font-semibold tabular-nums">{row.cpc !== null ? formatMoney(row.cpc * 100, row.currency) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CPM</p>
                      <p className="text-lg font-semibold tabular-nums">{row.cpm !== null ? formatMoney(row.cpm * 100, row.currency) : '—'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <p className="text-xs text-muted-foreground">
                No se muestran resultados agregados: distintas campañas pueden optimizar para tipos de resultado distintos y sumarlos no es válido. Ver el detalle en Meta Ads.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
