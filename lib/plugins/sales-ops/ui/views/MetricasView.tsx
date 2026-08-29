'use client';

import useSWR from 'swr';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { MetricsPayload } from '../../shared/api-types';
import { GATES } from '../../shared/taxonomy';
import { GATE_BAR_TONES } from '../components/GateBadge';
import { ErrorState, SectionTitle } from '../components/States';
import { SALES_OPS_API, fetcher, fmtDateShort, fmtInt, humanize, panel } from '../components/format';

const AGE_LABELS: Record<string, string> = {
  lt7: '< 7 días',
  '7to30': '7–30 días',
  '30to90': '30–90 días',
  '90to180': '90–180 días',
  gt180: '> 180 días',
  sin_dato: 'Sin dato',
};

const FOLLOWUP_LABELS: Record<string, string> = { '0': '0 impactos', '1': '1 impacto', '2': '2 impactos', '3plus': '3 o más' };

function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${Math.round((n / d) * 100)} %`;
}

export function MetricasView() {
  const { data, error, isLoading, mutate } = useSWR<MetricsPayload>(`${SALES_OPS_API}/metrics`, fetcher);

  if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const maxWeek = Math.max(1, ...data.cashByWeek.map((w) => w.usd));
  const maxGate = Math.max(1, ...GATES.map((g) => data.byGate[g]?.total ?? 0));

  return (
    <div className="space-y-4">
      <Panel title="Auditoría">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Cobertura" value={`${fmtInt(data.audit.analyzed)} / ${fmtInt(data.audit.total)}`} hint={pct(data.audit.analyzed, data.audit.total)} />
          <Kpi label="Confianza media" value={String(data.audit.avgConfidence)} />
          <Kpi label="Para revisar" value={`${data.audit.toReviewPct} %`} />
          <Kpi label="Hueco de evidencia" value={`${data.audit.evidenceGapPct} %`} />
          <Kpi label="Versiones por chat" value={String(data.audit.versionsPerChat)} />
          <Kpi label="Semanas con caja" value={String(data.cashByWeek.length)} />
        </dl>
      </Panel>

      <Panel title="Dinero cobrado por semana (USD al fx del plugin)">
        {data.cashByWeek.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin cobros en la misión todavía.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.cashByWeek.map((w) => (
              <li key={w.week} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[11px] tabular-nums text-muted-foreground">{fmtDateShort(w.week)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round((w.usd / maxWeek) * 100))}%` }} />
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums">USD {fmtInt(w.usd)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Por gate">
        <Table
          head={['Gate', 'Total', 'Respondieron', 'Recuperados', 'Propuesta', 'Pagaron', 'USD']}
          rows={GATES.map((g) => {
            const r = data.byGate[g];
            return [
              <span key="g" className="flex items-center gap-2">
                <span className="w-8 font-semibold tabular-nums">{g}</span>
                <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                  <span className={cn('block h-full rounded-full', GATE_BAR_TONES[g])} style={{ width: `${Math.round(((r?.total ?? 0) / maxGate) * 100)}%` }} />
                </span>
              </span>,
              fmtInt(r?.total),
              `${fmtInt(r?.responded)} (${pct(r?.responded ?? 0, r?.total ?? 0)})`,
              `${fmtInt(r?.recovered)} (${pct(r?.recovered ?? 0, r?.total ?? 0)})`,
              fmtInt(r?.proposal),
              fmtInt(r?.paid),
              fmtInt(r?.revenueUsd),
            ];
          })}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Por antigüedad del silencio">
          <Table
            head={['Bucket', 'Total', 'Respondieron', 'Recuperados']}
            rows={Object.entries(data.byAge).map(([k, r]) => [AGE_LABELS[k] ?? k, fmtInt(r.total), `${fmtInt(r.responded)} (${pct(r.responded, r.total)})`, `${fmtInt(r.recovered)} (${pct(r.recovered, r.total)})`])}
          />
        </Panel>
        <Panel title="Por impactos previos">
          <Table
            head={['Impactos', 'Total', 'Respondieron']}
            rows={Object.entries(data.byFollowups).map(([k, r]) => [FOLLOWUP_LABELS[k] ?? k, fmtInt(r.total), `${fmtInt(r.responded)} (${pct(r.responded, r.total)})`])}
          />
        </Panel>
        <Panel title="Por objeción">
          <Table
            head={['Objeción', 'Total', 'Recuperados']}
            rows={Object.entries(data.byObjection)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([k, r]) => [humanize(k), fmtInt(r.total), `${fmtInt(r.recovered)} (${pct(r.recovered, r.total)})`])}
          />
        </Panel>
        <Panel title="Por origen">
          <Table
            head={['Origen', 'Total', 'Pagaron', 'USD']}
            rows={Object.entries(data.bySource)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([k, r]) => [humanize(k), fmtInt(r.total), `${fmtInt(r.paid)} (${pct(r.paid, r.total)})`, fmtInt(r.revenueUsd)])}
          />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-xl border px-4 py-3', panel)}>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">
        {value}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Sin datos.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={cn('pb-1.5 pr-3 font-semibold', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((c, i) => (
                <td key={i} className={cn('py-1.5 pr-3 tabular-nums', i > 0 && 'text-right')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
