'use client';

import { cn } from '@/lib/utils';

import type { CashGoal } from '../../shared/api-types';
import { fmtDate, fmtInt, fmtMoney, panel, tiempoRelativo } from './format';

export function CashGoalBar({ cash }: { cash: CashGoal }) {
  const pct = cash.goalUsd > 0 ? Math.min(100, Math.round((cash.collectedUsd / cash.goalUsd) * 100)) : 0;
  const currencies = Object.entries(cash.byCurrency);
  return (
    <section className={cn('rounded-xl border p-4', panel)} aria-label="Meta de caja">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Meta de caja</h2>
        <span className="text-sm font-semibold tabular-nums">
          USD {fmtInt(cash.collectedUsd)} <span className="font-normal text-muted-foreground">/ {fmtInt(cash.goalUsd)}</span>
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {currencies.length ? currencies.map(([cur, amount]) => fmtMoney(amount, cur)).join(' · ') : 'Sin cobros todavía'}
        {' · '}
        {cash.salesCount} {cash.salesCount === 1 ? 'cobro' : 'cobros'}
        {cash.lastPaidAt && <> · última: {tiempoRelativo(cash.lastPaidAt)}</>}
        {' · desde '}
        {fmtDate(cash.since)}
      </p>
    </section>
  );
}
