'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { OverviewCampaignRow } from '@/lib/ads/types';
import { formatCurrency, formatNumber, formatPercent } from './format';

type SortKey = 'name' | 'spend' | 'results' | 'costPerResult' | 'impressions' | 'clicks' | 'ctr' | 'cpc';

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Activa', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  PAUSED: { label: 'Pausada', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300' },
  ARCHIVED: { label: 'Archivada', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  DELETED: { label: 'Eliminada', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  // Campaña que ya no está en Meta pero conserva histórico nuestro.
  UNKNOWN: { label: 'Histórica', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

export function CampaignsTable({
  campaigns,
  currency,
  resultLabel,
  range,
}: {
  campaigns: OverviewCampaignRow[];
  currency: string;
  resultLabel: string;
  range: { since: string; until: string };
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const open = (campaign: OverviewCampaignRow) => {
    router.push(`/plugins/meta-ads/campana/${campaign.id}?since=${range.since}&until=${range.until}`);
  };

  const sorted = useMemo(() => {
    const rows = [...campaigns];

    rows.sort((a, b) => {
      if (sortKey === 'name') {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }

      // Las campañas sin dato quedan siempre al final, se ordene ascendente o descendente.
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return rows;
  }, [campaigns, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const SortableHead = ({
    label,
    sortBy,
    align = 'right',
  }: {
    label: string;
    sortBy: SortKey;
    align?: 'left' | 'right';
  }) => (
    <TableHead
      onClick={() => toggle(sortBy)}
      className={`cursor-pointer select-none whitespace-nowrap hover:text-foreground ${align === 'right' ? 'text-right' : ''}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        {sortKey === sortBy && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </TableHead>
  );

  if (campaigns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay campañas con datos en este período.
      </p>
    );
  }

  return (
    <>
      {/* Móvil: una tabla de 11 columnas no se lee en un teléfono, así que va como tarjetas. */}
      <div className="space-y-2 md:hidden">
        {sorted.map((campaign) => {
          const badge = STATUS_BADGE[campaign.status ?? ''] ?? null;

          return (
            <button
              key={campaign.id}
              onClick={() => open(campaign)}
              className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left active:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{campaign.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {badge && <Badge className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>}
                  <span className="text-[10px] text-muted-foreground">{campaign.objectiveLabel}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">Inversión</p>
                    <p className="font-medium tabular-nums">{formatCurrency(campaign.spend, currency)}</p>
                  </div>
                  <div>
                    <p className="truncate text-muted-foreground">{campaign.resultLabel}</p>
                    <p className="font-medium tabular-nums">{formatNumber(campaign.results)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Costo/result.</p>
                    <p className="font-medium tabular-nums">{formatCurrency(campaign.costPerResult, currency)}</p>
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Campaña" sortBy="name" align="left" />
              <TableHead className="whitespace-nowrap">Objetivo</TableHead>
              <SortableHead label="Inversión final" sortBy="spend" />
              <SortableHead label={resultLabel} sortBy="results" />
              <SortableHead label="Costo por resultado" sortBy="costPerResult" />
              <SortableHead label="Impresiones" sortBy="impressions" />
              <SortableHead label="Clics" sortBy="clicks" />
              <SortableHead label="CTR" sortBy="ctr" />
              <SortableHead label="CPC" sortBy="cpc" />
              <TableHead className="whitespace-nowrap text-right">Presupuesto</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((campaign) => {
              const badge = STATUS_BADGE[campaign.status ?? ''] ?? null;

              return (
                <TableRow key={campaign.id} onClick={() => open(campaign)} className="cursor-pointer">
                  <TableCell className="max-w-[260px]">
                    <p className="truncate font-medium" title={campaign.name}>
                      {campaign.name}
                    </p>
                    {badge && <Badge className={`mt-1 text-[10px] ${badge.className}`}>{badge.label}</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {campaign.objectiveLabel}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatCurrency(campaign.spend, currency)}
                    <p className="text-[10px] font-normal text-muted-foreground">
                      neto {formatCurrency(campaign.spendNet, currency)}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatNumber(campaign.results)}
                    {campaign.results > 0 && (
                      <p className="text-[10px] font-normal text-muted-foreground">{campaign.resultLabel}</p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                    {formatCurrency(campaign.costPerResult, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatNumber(campaign.impressions)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatNumber(campaign.clicks)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatPercent(campaign.ctr)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {formatCurrency(campaign.cpc, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                    {campaign.dailyBudget
                      ? `${formatCurrency(campaign.dailyBudget, currency)} / día`
                      : campaign.lifetimeBudget
                        ? `${formatCurrency(campaign.lifetimeBudget, currency)} total`
                        : '—'}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
