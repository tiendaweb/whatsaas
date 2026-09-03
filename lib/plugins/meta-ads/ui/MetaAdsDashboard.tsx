'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertCircle, FileDown, Loader2, Megaphone, RefreshCw, Search, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Granularity, OverviewResponse } from '@/lib/ads/types';
import { KpiCards } from './KpiCards';
import { SpendResultsChart } from './SpendResultsChart';
import { CampaignsTable } from './CampaignsTable';
import { SyncRunsTable } from './SyncRunsTable';
import { RangeToolbar } from './RangeToolbar';
import { exportCampaignsPdf } from './pdf';
import { formatDateTime } from './format';
import { resolveRange, type Range, type RangeId } from './ranges';

type AccountItem = {
  id: number;
  accountId: string;
  name: string;
  currency: string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  tokenStatus: string;
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((res) => res.json());

export function MetaAdsDashboard() {
  // Sólo las cuentas marcadas como visibles: las ocultas se apagan desde ajustes.
  const { data: accounts, isLoading: loadingAccounts } = useSWR<AccountItem[]>(
    '/api/plugins/meta-ads/accounts?visible=1',
    fetcher,
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [range, setRange] = useState<Range>(() => resolveRange('last_30'));
  const [rangeId, setRangeId] = useState<RangeId>('last_30');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [statusFilter, setStatusFilter] = useState('all');
  const [objectiveFilter, setObjectiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);

  const accountList = useMemo(() => (Array.isArray(accounts) ? accounts : []), [accounts]);
  const accountId = selectedId ?? accountList[0]?.id ?? null;
  const account = accountList.find((item) => item.id === accountId) ?? null;

  const { data, isLoading, mutate } = useSWR<OverviewResponse>(
    accountId
      ? `/api/plugins/meta-ads/overview?accountId=${accountId}&since=${range.since}&until=${range.until}&granularity=${granularity}`
      : null,
    fetcher,
  );

  const handleSync = async () => {
    if (!accountId) return;
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/plugins/meta-ads/accounts/${accountId}/sync`, { method: 'POST' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo sincronizar.');

      const { campaignsUpserted, insightsUpserted } = json.summary;
      toast.success(`Sincronizado: ${campaignsUpserted} campañas, ${insightsUpserted} días de métricas.`);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al sincronizar.');
    } finally {
      setIsSyncing(false);
    }
  };

  const campaigns = useMemo(() => {
    const rows = data?.campaigns ?? [];
    const search = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (objectiveFilter !== 'all' && row.objective !== objectiveFilter) return false;
      if (search && !row.name.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [data, statusFilter, objectiveFilter, query]);

  const objectives = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.campaigns ?? []) {
      if (row.objective) map.set(row.objective, row.objectiveLabel);
    }
    return [...map.entries()];
  }, [data]);

  const handleExport = async () => {
    if (!data || !account) return;
    setIsExporting(true);
    try {
      await exportCampaignsPdf({
        accountName: account.name,
        currency: data.account.currency,
        taxRate: data.account.taxRate,
        range: data.range,
        kpis: data.kpis,
        resultLabel: data.resultLabel,
        rows: campaigns,
        chartContainer: chartRef.current,
        lastSyncedAt: data.account.lastSyncedAt,
      });
      toast.success('Reporte PDF generado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingAccounts) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accountList.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6">
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-sky-500">
              <Megaphone className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold">Conectá tu cuenta de Meta Ads</h2>
            <p className="text-sm text-muted-foreground">
              Necesitás un token de usuario del sistema para ver tus campañas, resultados e historial. Si ya tenés
              cuentas conectadas, puede que estén ocultas en ajustes.
            </p>
            <Button asChild className="mt-2">
              <Link href="/plugins/meta-ads/cuentas">Ir a cuentas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-sky-500">
              <Megaphone className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold sm:text-2xl">Meta Ads</h1>
              <p className="truncate text-xs text-muted-foreground">
                {data?.account.lastSyncedAt
                  ? `Datos al ${formatDateTime(data.account.lastSyncedAt)}`
                  : 'Sin sincronizar todavía'}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={String(accountId ?? '')} onValueChange={(value) => setSelectedId(Number(value))}>
              <SelectTrigger className="min-w-[160px] flex-1 sm:w-[200px] sm:flex-none">
                <SelectValue placeholder="Cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accountList.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} · {item.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" asChild title="Cuentas y ajustes">
              <Link href="/plugins/meta-ads/cuentas">
                <Settings2 className="h-4 w-4" />
              </Link>
            </Button>

            <Button variant="outline" size="icon" onClick={handleSync} disabled={isSyncing} title="Sincronizar">
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>

            <Button onClick={handleExport} disabled={isExporting || !data}>
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <FileDown className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">Exportar PDF</span>
            </Button>
          </div>
        </div>

        {account?.tokenStatus === 'invalid' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              El token de Meta está vencido. Los datos que ves son los últimos sincronizados.{' '}
              <Link href="/plugins/meta-ads/cuentas" className="underline underline-offset-2">
                Reemplazá el token
              </Link>{' '}
              para volver a actualizar.
            </AlertDescription>
          </Alert>
        )}

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

        {isLoading || !data ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="resumen" className="space-y-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="resumen" className="flex-1 sm:flex-none">
                Resumen
              </TabsTrigger>
              <TabsTrigger value="campanas" className="flex-1 sm:flex-none">
                Campañas
              </TabsTrigger>
              <TabsTrigger value="historial" className="flex-1 sm:flex-none">
                Historial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="resumen" className="space-y-4">
              <KpiCards
                kpis={data.kpis}
                previousKpis={data.previousKpis}
                currency={data.account.currency}
                taxRate={data.account.taxRate}
                resultLabel={data.resultLabel}
              />
              <SpendResultsChart
                ref={chartRef}
                series={data.series}
                currency={data.account.currency}
                resultLabel={data.resultLabel}
              />
              <div>
                <h2 className="mb-2 text-sm font-semibold">Top campañas por inversión</h2>
                <CampaignsTable
                  campaigns={data.campaigns.slice(0, 5)}
                  currency={data.account.currency}
                  resultLabel={data.resultLabel}
                  range={data.range}
                />
              </div>
            </TabsContent>

            <TabsContent value="campanas" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1 sm:max-w-xs sm:flex-none">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar campaña"
                    className="pl-9"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[145px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="ACTIVE">Activas</SelectItem>
                    <SelectItem value="PAUSED">Pausadas</SelectItem>
                    <SelectItem value="UNKNOWN">Históricas</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={objectiveFilter} onValueChange={setObjectiveFilter}>
                  <SelectTrigger className="w-[165px]">
                    <SelectValue placeholder="Objetivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los objetivos</SelectItem>
                    {objectives.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-xs text-muted-foreground">
                  {campaigns.length} de {data.campaigns.length}
                </span>
              </div>

              <CampaignsTable
                campaigns={campaigns}
                currency={data.account.currency}
                resultLabel={data.resultLabel}
                range={data.range}
              />
            </TabsContent>

            <TabsContent value="historial">{accountId && <SyncRunsTable accountId={accountId} />}</TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
