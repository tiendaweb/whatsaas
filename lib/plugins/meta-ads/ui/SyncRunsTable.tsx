'use client';

import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDateTime } from './format';

type SyncRun = {
  id: number;
  trigger: string;
  status: string;
  since: string | null;
  until: string | null;
  campaignsUpserted: number;
  insightsUpserted: number;
  error: string | null;
  startedAt: string;
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((res) => res.json());

const STATUS: Record<string, { label: string; className: string }> = {
  ok: { label: 'Completa', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  partial: { label: 'Parcial', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  running: { label: 'En curso', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
};

export function SyncRunsTable({ accountId }: { accountId: number }) {
  const { data, isLoading } = useSWR<SyncRun[]>(`/api/plugins/meta-ads/sync-runs?accountId=${accountId}`, fetcher);

  const runs = Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Todavía no hay sincronizaciones.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">Campañas</TableHead>
            <TableHead className="text-right">Días de métricas</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const status = STATUS[run.status] ?? { label: run.status, className: '' };

            return (
              <TableRow key={run.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(run.startedAt)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {run.trigger === 'cron' ? 'Automática' : 'Manual'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(run.since)} – {formatDate(run.until)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{run.campaignsUpserted}</TableCell>
                <TableCell className="text-right tabular-nums">{run.insightsUpserted}</TableCell>
                <TableCell>
                  <Badge className={`text-[10px] ${status.className}`}>{status.label}</Badge>
                  {run.error && (
                    <p className="mt-1 max-w-[260px] truncate text-[10px] text-destructive" title={run.error}>
                      {run.error}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
