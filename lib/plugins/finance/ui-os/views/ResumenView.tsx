'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CreditCard, Loader2, Scale, Wallet } from 'lucide-react';
import { FIN_API, finFetcher } from '../api';
import { BarrasMensuales, DineroPorMoneda, EstadoBadge, EstadoVacio, Metrica } from '../componentes';
import { F } from '../estilo';
import { fmtDate, fmtMoney, fmtMoneyMap } from '../format';
import type { financeOsResumen } from '@/lib/plugins/finance/server/os';

type Resumen = Awaited<ReturnType<typeof financeOsResumen>>;

export function ResumenView({ onAbrirCliente, onIrA }: { onAbrirCliente: (id: number) => void; onIrA: (vista: 'movimientos' | 'cobros' | 'membresias') => void }) {
  const { data, isLoading } = useSWR<Resumen>(FIN_API.resumen, finFetcher);
  const [moneda, setMoneda] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const monedasSerie = [...new Set(data.serie.flatMap((p) => [...Object.keys(p.income), ...Object.keys(p.expense)]))].sort();
  const monedaActiva = moneda && monedasSerie.includes(moneda) ? moneda : monedasSerie.includes('ARS') ? 'ARS' : monedasSerie[0];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Fila de métricas del mes */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica icon={ArrowUpCircle} tono="emerald" rotulo="Ingresos del mes">
          <DineroPorMoneda map={data.mes.income} />
        </Metrica>
        <Metrica icon={ArrowDownCircle} tono="rose" rotulo="Egresos del mes">
          <DineroPorMoneda map={data.mes.expense} />
        </Metrica>
        <Metrica icon={Scale} tono="sky" rotulo="Resultado del mes">
          <DineroPorMoneda map={data.mes.resultado} signo />
        </Metrica>
        <Metrica
          icon={Wallet}
          tono="amber"
          rotulo="Por cobrar"
          pie={data.vencidas > 0 ? <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3" /> {data.vencidas} vencidos</span> : 'Sin vencidos'}
        >
          <DineroPorMoneda map={data.porCobrar} />
        </Metrica>
      </div>

      {/* Membresías + por pagar */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metrica icon={CreditCard} tono="violet" rotulo="Membresías activas" pie={`${data.membresias.porVencer30} vencen en 30 días`}>
          <p className={F.numeroXl}>{data.membresias.activas.count}</p>
          <p className="text-xs font-bold text-muted-foreground">{fmtMoneyMap(data.membresias.activas.byCurrency)}</p>
        </Metrica>
        <button type="button" onClick={() => onIrA('membresias')} className="text-left">
          <Metrica icon={AlertTriangle} tono="amber" rotulo="Membresías con pago pendiente" pie="Ver membresías →">
            <p className={F.numeroXl}>{data.membresias.pagoPendiente.count}</p>
            <p className="text-xs font-bold text-muted-foreground">{fmtMoneyMap(data.membresias.pagoPendiente.byCurrency)}</p>
          </Metrica>
        </button>
        <button type="button" onClick={() => onIrA('cobros')} className="text-left">
          <Metrica icon={ArrowDownCircle} tono="rose" rotulo="Por pagar" pie="Ver cobros y pagos →">
            <DineroPorMoneda map={data.porPagar} />
          </Metrica>
        </button>
      </div>

      {/* Serie mensual */}
      <div className={`${F.card} p-4`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className={F.rotulo}>Flujo mensual (12 meses)</span>
          <div className="flex gap-1">
            {monedasSerie.map((cur) => (
              <button key={cur} type="button" onClick={() => setMoneda(cur)} className={`${F.btn} ${cur === monedaActiva ? F.btnPrimario : F.btnSuave}`}>
                {cur}
              </button>
            ))}
          </div>
        </div>
        {monedaActiva ? <BarrasMensuales serie={data.serie} currency={monedaActiva} /> : <EstadoVacio>Sin movimientos todavía.</EstadoVacio>}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Gastos por categoría (mes) */}
        <div className={`${F.card} p-4`}>
          <span className={F.rotulo}>Gastos del mes por categoría</span>
          <div className="mt-3 space-y-2">
            {data.gastosPorCategoria.length === 0 && <EstadoVacio>Sin gastos este mes.</EstadoVacio>}
            {data.gastosPorCategoria.slice(0, 8).map((g) => (
              <div key={g.categoria} className="flex items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2">
                <span className="truncate text-sm font-bold">{g.categoria}</span>
                <span className="text-sm font-black tabular-nums">{fmtMoneyMap(g.byCurrency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Últimos movimientos */}
        <div className={`${F.card} p-4`}>
          <span className={F.rotulo}>Últimos movimientos</span>
          <div className="mt-3 space-y-1">
            {data.ultimos.length === 0 && <EstadoVacio>Sin movimientos registrados.</EstadoVacio>}
            {data.ultimos.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.title}</p>
                  <p className="text-[11px] font-bold text-muted-foreground">
                    {fmtDate(e.occurredOn)} · {e.category}
                    {e.customerName ? (
                      <>
                        {' · '}
                        <button type="button" className="underline decoration-dotted" onClick={() => e.customerId && onAbrirCliente(e.customerId)}>
                          {e.customerName}
                        </button>
                      </>
                    ) : null}
                  </p>
                </div>
                <EstadoBadge estado={e.status} />
                <span className={`text-sm font-black tabular-nums ${e.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {e.type === 'income' ? '+' : '−'}
                  {fmtMoney(e.amount, e.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
