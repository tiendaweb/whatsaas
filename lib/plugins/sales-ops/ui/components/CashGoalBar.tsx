'use client';

import { Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { CashGoal } from '../../shared/api-types';
import { CH, TONOS } from '../hoy/estilo';
import { fmtDate, fmtInt, fmtMoney, tiempoRelativo } from './format';

/**
 * Meta de caja del período, con la forma de Tareas OS: rótulo en versalitas,
 * el número grande arriba de todo y la barra abajo.
 *
 * Es el único dato de la pantalla que responde "¿cómo venimos?", así que gana
 * el tamaño: antes competía de igual a igual con seis contadores de 12 px.
 */
export function CashGoalBar({ cash }: { cash: CashGoal }) {
  const pct = cash.goalUsd > 0 ? Math.min(100, Math.round((cash.collectedUsd / cash.goalUsd) * 100)) : 0;
  const currencies = Object.entries(cash.byCurrency);
  return (
    <section className={cn('p-5', CH.card)} aria-label="Meta de caja">
      <div className="flex items-start gap-3">
        <span className={cn(CH.iconoCaja, TONOS.emerald)}>
          <Banknote className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className={CH.rotulo}>Meta de caja</h2>
            <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{pct} %</span>
          </div>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className={CH.numero}>USD {fmtInt(cash.collectedUsd)}</span>
            <span className="text-sm font-bold text-muted-foreground">/ {fmtInt(cash.goalUsd)}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
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
