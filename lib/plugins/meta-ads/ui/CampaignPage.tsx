'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CampaignDetailResponse, Granularity } from '@/lib/ads/types';
import { KpiCards } from './KpiCards';
import { SpendResultsChart } from './SpendResultsChart';
import { STATUS_BADGE } from './CampaignsTable';
import { RangeToolbar } from './RangeToolbar';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from './format';
import { resolveRange, type Range, type RangeId } from './ranges';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((res) => res.json());

export function CampaignPage({ campaignId }: { campaignId: number }) {
  const params = useSearchParams();

  const [range, setRange] = useState<Range>(() => {
    const since = params.get('since');
    const until = params.get('until');
    return since && until ? { since, until } : resolveRange('last_30');
  });
  const [rangeId, setRangeId] = useState<RangeId>(params.get('since') ? 'custom' : 'last_30');
  const [granularity, setGranularity] = useState<Granularity>('day');

  const { data, isLoading } = useSWR<CampaignDetailResponse>(
    `/api/plugins/meta-ads/campaigns/${campaignId}?since=${range.since}&until=${range.until}&granularity=${granularity}`,
    fetcher,
  );

  if (isLoading || !data?.campaign) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { campaign, account, totals, series, daily, actions } = data;
  const badge = STATUS_BADGE[campaign.status ?? ''] ?? null;
  const currency = account.currency;

  const details: Array<[string, string]> = [
    ['Objetivo', campaign.objectiveLabel],
    ['Estado en Meta', campaign.effectiveStatus ?? campaign.status ?? '—'],
    ['Tipo de compra', campaign.buyingType ?? '—'],
    ['ID de campaña', campaign.campaignId],
    ['Creada', formatDate(campaign.createdTime)],
    ['Inicio', formatDate(campaign.startTime)],
    ['Fin', campaign.stopTime ? formatDate(campaign.stopTime) : 'Sin fecha de fin'],
    [
      'Presupuesto',
      campaign.dailyBudget
        ? `${formatCurrency(campaign.dailyBudget, currency)} / día`
        : campaign.lifetimeBudget
          ? `${formatCurrency(campaign.lifetimeBudget, currency)} total`
          : '—',
    ],
    ['Días con inversión', `${campaign.activeDays} de ${daily.length}`],
    ['Cuenta', `${account.name} (act_${account.accountId})`],
    ['Zona horaria', account.timezoneName ?? '—'],
    ['Métrica de resultado', campaign.resultLabel],
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
            <Link href="/plugins/meta-ads">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-snug sm:text-2xl">{campaign.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {badge && <Badge className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>}
              <span className="text-xs text-muted-foreground">{campaign.objectiveLabel}</span>
              <span className="text-xs text-muted-foreground">· {account.name}</span>
            </div>
          </div>
        </div>

        <RangeToolbar
          range={range}
          rangeId={rangeId}
          granularity={granularity}
          onRangeChange={(next, id) => {
            setRange(next);
            setRangeId(id);
          }}
          onGranularityChange={setGranularity}
        />

        <KpiCards
          kpis={totals}
          currency={currency}
          taxRate={account.taxRate}
          resultLabel={campaign.resultLabel}
        />

        <SpendResultsChart
          series={series}
          currency={currency}
          resultLabel={campaign.resultLabel}
          title="Evolución"
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detalles</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                {details.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="truncate text-right font-medium" title={value}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Todas las acciones</CardTitle>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin acciones registradas en el período.
                </p>
              ) : (
                <div className="max-h-[420px] overflow-y-auto">
                  <dl className="divide-y text-sm">
                    {actions.map((action) => (
                      <div key={action.actionType} className="flex items-center justify-between gap-3 py-2">
                        <dt className="min-w-0 flex-1">
                          <p className="truncate">{action.label}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{action.actionType}</p>
                        </dt>
                        <dd className="shrink-0 text-right">
                          <p className="font-medium tabular-nums">{formatNumber(action.value)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatCurrency(action.costPerAction, currency)} c/u
                          </p>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Día por día</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Inversión final</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">{campaign.resultLabel}</TableHead>
                  <TableHead className="text-right">Costo por resultado</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">Alcance</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daily.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDate(row.date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatCurrency(row.spend, currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {formatCurrency(row.spendNet, currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatNumber(row.results)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatCurrency(row.costPerResult, currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {formatNumber(row.impressions)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {formatNumber(row.reach)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {formatNumber(row.clicks)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {formatPercent(row.ctr)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {account.lastSyncedAt && (
          <p className="pb-4 text-xs text-muted-foreground">
            Datos sincronizados desde Meta el {formatDateTime(account.lastSyncedAt)}.
          </p>
        )}
      </div>
    </div>
  );
}
