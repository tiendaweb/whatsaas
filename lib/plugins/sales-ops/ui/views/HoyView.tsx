'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { OverviewPayload } from '../../shared/api-types';
import { GATES } from '../../shared/taxonomy';
import { CashGoalBar } from '../components/CashGoalBar';
import { GATE_BAR_TONES, GateBadge } from '../components/GateBadge';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { StatTile } from '../components/StatTile';
import { ErrorState, SectionTitle } from '../components/States';
import type { Vista } from '../components/vistas';
import { OWNER_LABELS, SALES_OPS_API, SIGNAL_LABELS, fetcher, fmtInt, panel } from '../components/format';

type Props = {
  owner: OwnerFilterValue;
  onChangeVista: (vista: Vista) => void;
  onOpen: (chatId: number) => void;
};

export function HoyView({ owner, onChangeVista, onOpen }: Props) {
  const { data, error, isLoading, mutate } = useSWR<OverviewPayload>(`${SALES_OPS_API}/overview`, fetcher, { refreshInterval: 60_000 });

  const nextBest = useMemo(() => {
    const rows = data?.nextBest ?? [];
    // El filtro global sólo recorta la lista; los contadores son del equipo entero.
    return owner === 'todos' ? rows : rows.filter((r) => r.owner === owner);
  }, [data, owner]);

  if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;
  if (isLoading || !data) return <HoySkeleton />;

  const maxGate = Math.max(1, ...GATES.map((g) => data.distribution[g] ?? 0));
  const audit = data.audit;

  return (
    <div className="space-y-5">
      <CashGoalBar cash={data.cash} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Dinero ahora" value={data.counters.moneyNow} hint="G8–G10" onClick={() => onChangeVista('dinero')} />
        <StatTile label="Respondieron hoy" value={data.counters.respondedToday} hint="señales" onClick={() => onChangeVista('respuestas')} />
        <StatTile label="Oportunidades" value={data.counters.opportunities} hint="G4–G7" onClick={() => onChangeVista('oportunidades')} />
        <StatTile label="Barrido" value={data.counters.sweep} hint="G0–G3" onClick={() => onChangeVista('barrido')} />
        <StatTile label="Pre-descarte" value={data.counters.preDiscard} onClick={() => onChangeVista('limpieza')} />
        <StatTile label="Clientes" value={data.counters.customers} hint="G11" onClick={() => onChangeVista('todos')} />
      </div>

      <section className={cn('rounded-xl border px-4 py-3', panel)} aria-label="Auditoría">
        <SectionTitle>Auditoría</SectionTitle>
        <p className="mt-1 text-sm text-foreground">
          <span className="font-semibold tabular-nums">{fmtInt(audit.analyzed)} / {fmtInt(audit.total)}</span> analizados
          <span className="text-muted-foreground"> · {fmtInt(audit.stale)} desactualizados · {fmtInt(audit.toReview)} para revisar · {fmtInt(audit.audiosQueued)} audios en cola · {fmtInt(audit.connectorPending)} pendientes de conectores</span>
        </p>
      </section>

      <section className={cn('rounded-xl border px-2 py-3', panel)} aria-label="Siguiente mejor acción">
        <div className="px-2">
          <SectionTitle
            action={
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onChangeVista('cola')}>
                Ver cola <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            }
          >
            Siguiente mejor acción
          </SectionTitle>
        </div>
        {nextBest.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {data.audit.analyzed === 0 ? 'Todavía no hay chats analizados.' : 'Nada urgente para este responsable.'}
          </p>
        ) : (
          <ol className="mt-1 divide-y divide-border/60">
            {nextBest.map((item, i) => (
              <li key={`${item.chatId}-${i}`} className="flex items-center gap-2 px-2 py-2">
                <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                    {item.reason === 'signal' ? (
                      <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        señal: {item.signalKind ? SIGNAL_LABELS[item.signalKind] : 'nueva'}
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <GateBadge gate={item.gate} />
                        <span className="text-[11px] tabular-nums text-muted-foreground">{fmtInt(item.priorityScore)}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">{item.text || '—'}</span>
                    <span className="shrink-0">{OWNER_LABELS[item.owner] ?? item.owner}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => onOpen(item.chatId)}>
                  {item.reason === 'signal' ? 'Responder' : 'Abrir'}
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={cn('rounded-xl border px-4 py-3', panel)} aria-label="Distribución por gate">
        <SectionTitle>Distribución</SectionTitle>
        <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {GATES.map((g) => {
            const n = data.distribution[g] ?? 0;
            const w = Math.max(n > 0 ? 2 : 0, Math.round((n / maxGate) * 100));
            return (
              <li key={g} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">{g}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn('block h-full rounded-full', GATE_BAR_TONES[g])} style={{ width: `${w}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-foreground">{fmtInt(n)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function HoySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
