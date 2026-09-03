'use client';

import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { FIN_API, finFetcher } from '../api';
import { EstadoBadge, EstadoVacio } from '../componentes';
import { F } from '../estilo';
import { fmtDate, fmtMoney, fmtMoneyMap, fmtUnits } from '../format';
import type { financeOsCobros } from '@/lib/plugins/finance/server/os';

type Cobros = Awaited<ReturnType<typeof financeOsCobros>>;

/** Todo lo que hay que cobrar y pagar, más renovaciones y pagos de pasarela. */
export function CobrosView({ onAbrirCliente }: { onAbrirCliente: (id: number) => void }) {
  const { data, isLoading } = useSWR<Cobros>(FIN_API.cobros, finFetcher);

  if (isLoading || !data) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Por cobrar */}
        <div className={`${F.card} p-4`}>
          <div className="flex items-center justify-between">
            <span className={F.rotulo}>Por cobrar</span>
            <span className="text-sm font-black tabular-nums">{fmtMoneyMap(data.receivables.totalByCurrency)}</span>
          </div>
          <div className="mt-2 divide-y divide-border/60">
            {data.receivables.rows.length === 0 && <EstadoVacio>Nada por cobrar. 🎉</EstadoVacio>}
            {data.receivables.rows.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.title}</p>
                  <p className="text-[11px] font-bold text-muted-foreground">
                    {e.customerId ? (
                      <button type="button" className="underline decoration-dotted" onClick={() => onAbrirCliente(e.customerId!)}>{e.customerName ?? 'Cliente'}</button>
                    ) : (e.counterparty ?? 'Sin cliente')}
                    {' · '}vence {fmtDate(e.dueOn ?? e.occurredOn)}
                  </p>
                </div>
                <EstadoBadge estado={e.status} overdue={e.overdue} />
                <span className="text-sm font-black tabular-nums">{fmtMoney(e.amount, e.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Por pagar */}
        <div className={`${F.card} p-4`}>
          <div className="flex items-center justify-between">
            <span className={F.rotulo}>Por pagar</span>
            <span className="text-sm font-black tabular-nums">{fmtMoneyMap(data.payables.totalByCurrency)}</span>
          </div>
          <div className="mt-2 divide-y divide-border/60">
            {data.payables.rows.length === 0 && <EstadoVacio>Nada por pagar.</EstadoVacio>}
            {data.payables.rows.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.title}</p>
                  <p className="text-[11px] font-bold text-muted-foreground">{e.counterparty ?? e.category} · vence {fmtDate(e.dueOn ?? e.occurredOn)}</p>
                </div>
                <EstadoBadge estado={e.status} overdue={e.overdue} />
                <span className="text-sm font-black tabular-nums">{fmtMoney(e.amount, e.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Renovaciones de membresías */}
      <div className={`${F.card} p-4`}>
        <span className={F.rotulo}>Renovaciones de membresías ({data.renovaciones.count})</span>
        <div className="mt-2 divide-y divide-border/60">
          {data.renovaciones.rows.length === 0 && <EstadoVacio>Sin renovaciones próximas ni pagos pendientes.</EstadoVacio>}
          {data.renovaciones.rows.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {s.customerId ? (
                    <button type="button" className="hover:underline" onClick={() => onAbrirCliente(s.customerId!)}>{s.customerName ?? `Cliente #${s.customerId}`}</button>
                  ) : (s.customerName ?? 'Sin cliente')}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  {s.planName || 'Plan'} · {s.endDate ? `vence ${fmtDate(s.endDate)}` : 'sin vencimiento'}
                  {typeof s.daysLeft === 'number' && s.daysLeft >= 0 ? ` (${s.daysLeft} días)` : ''}
                </p>
              </div>
              <EstadoBadge estado={s.paymentStatus} />
              <span className="text-sm font-black tabular-nums">{fmtMoney(s.price, s.currency)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pasarela */}
      <div className={`${F.card} p-4`}>
        <span className={F.rotulo}>Últimos pagos por pasarela</span>
        <p className="mt-1 text-[11px] font-bold text-muted-foreground">Mercado Pago, transferencias y pagos offline importados. Los importes vienen de la pasarela tal cual (en unidades).</p>
        <div className="mt-2 divide-y divide-border/60">
          {data.pasarela.length === 0 && <EstadoVacio>Sin transacciones de pasarela.</EstadoVacio>}
          {data.pasarela.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {t.customerId ? (
                    <button type="button" className="hover:underline" onClick={() => onAbrirCliente(t.customerId!)}>{t.customerName ?? 'Cliente'}</button>
                  ) : (t.customerName ?? 'Sin cliente')}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">{t.gateway || 'Pasarela'} · {t.date ? fmtDate(new Date(t.date)) : '—'}</p>
              </div>
              <EstadoBadge estado={t.paymentStatus ?? ''} />
              <span className="text-sm font-black tabular-nums">{fmtUnits(t.amountUnits, t.currency)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
