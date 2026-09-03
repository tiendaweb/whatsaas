'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Building2, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FIN_API, finFetcher } from '../api';
import { EstadoBadge, EstadoVacio, Paginador } from '../componentes';
import { F, TONOS } from '../estilo';
import { fmtDate, fmtMoney, fmtMoneyMap } from '../format';
import type { financeOsMembresias, financeOsSuscripciones } from '@/lib/plugins/finance/server/os';

type Membresias = Awaited<ReturnType<typeof financeOsMembresias>>;
type Suscripciones = Awaited<ReturnType<typeof financeOsSuscripciones>>;

/** Ventas de membresías de TODAS las empresas: la "parte financiera" que faltaba. */
export function MembresiasView({ onAbrirCliente }: { onAbrirCliente: (id: number) => void }) {
  const { data: resumen } = useSWR<Membresias>(FIN_API.membresias, finFetcher);
  const [filtros, setFiltros] = useState<{ companyId: string; status: string; paymentStatus: string; q: string; page: number }>({ companyId: '', status: 'active', paymentStatus: '', q: '', page: 1 });

  const params = new URLSearchParams();
  if (filtros.companyId) params.set('companyId', filtros.companyId);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.paymentStatus) params.set('paymentStatus', filtros.paymentStatus);
  if (filtros.q) params.set('q', filtros.q);
  params.set('page', String(filtros.page));
  const { data: subs, isLoading, mutate } = useSWR<Suscripciones>(`${FIN_API.suscripciones}?${params}`, finFetcher, { keepPreviousData: true });

  const set = (patch: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...patch }));

  const marcarPagada = async (id: number) => {
    const res = await fetch(FIN_API.suscripcion(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentStatus: 'paid' }) });
    if (!res.ok) return toast.error('No se pudo marcar el pago');
    toast.success('Membresía marcada como pagada');
    mutate();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Empresas */}
      <div className="grid gap-3 lg:grid-cols-3">
        {(resumen?.companies ?? []).map((c) => (
          <button
            key={c.companyId ?? 'none'}
            type="button"
            onClick={() => set({ companyId: c.companyId === null ? 'null' : String(c.companyId) })}
            className={`${F.card} p-4 text-left transition-colors hover:border-emerald-600/40 ${String(c.companyId ?? 'null') === filtros.companyId ? 'border-emerald-600/60' : ''}`}
          >
            <div className="flex items-center gap-3">
              <span className={`${F.iconoCaja} ${TONOS.violet}`}><Building2 className="size-5" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{c.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{c.activas.count} activas · {c.vencidas} vencidas</p>
              </div>
            </div>
            <p className="mt-3 text-lg font-black tabular-nums">{fmtMoneyMap(c.activas.byCurrency)}</p>
            <p className="text-[11px] font-bold text-muted-foreground">
              {c.pagoPendiente.count > 0 ? `${c.pagoPendiente.count} con pago pendiente (${fmtMoneyMap(c.pagoPendiente.byCurrency)})` : 'Cobros al día'} · {c.porVencer30} por vencer
            </p>
            {c.plans.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-border pt-2">
                {c.plans.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                    <span className="truncate">{p.name}</span>
                    <span className="tabular-nums">{p.activeSubs} · {fmtMoney(p.price, p.currency)}</span>
                  </div>
                ))}
                {c.plans.length > 4 && <p className="text-[10px] font-bold text-muted-foreground">+{c.plans.length - 4} planes más</p>}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Filtros de suscripciones */}
      <div className={`${F.card} flex flex-wrap items-center gap-2 p-3`}>
        <input className={`${F.input} min-w-40 flex-1`} placeholder="Buscar cliente o plan…" value={filtros.q} onChange={(e) => set({ q: e.target.value })} />
        <select className={F.select} value={filtros.companyId} onChange={(e) => set({ companyId: e.target.value })}>
          <option value="">Todas las empresas</option>
          {(resumen?.companies ?? []).map((c) => (
            <option key={c.companyId ?? 'none'} value={c.companyId === null ? 'null' : String(c.companyId)}>{c.name}</option>
          ))}
        </select>
        <select className={F.select} value={filtros.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="expired">Vencidas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <select className={F.select} value={filtros.paymentStatus} onChange={(e) => set({ paymentStatus: e.target.value })}>
          <option value="">Todos los pagos</option>
          <option value="paid">Pagadas</option>
          <option value="pending">Pago pendiente</option>
        </select>
      </div>

      {isLoading && !subs ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : !subs || subs.rows.length === 0 ? (
        <EstadoVacio>No hay suscripciones con estos filtros.</EstadoVacio>
      ) : (
        <div className={`${F.card} divide-y divide-border`}>
          {subs.rows.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {s.customerId ? (
                    <button type="button" className="hover:underline" onClick={() => onAbrirCliente(s.customerId!)}>{s.customerName ?? `Cliente #${s.customerId}`}</button>
                  ) : (
                    s.customerName ?? 'Sin cliente'
                  )}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  {s.planName || 'Plan'} · {s.number} · {fmtDate(s.startDate)} → {s.endDate ? fmtDate(s.endDate) : '∞'}
                  {typeof s.daysLeft === 'number' ? (s.daysLeft < 0 ? ` · venció hace ${-s.daysLeft} días` : ` · ${s.daysLeft} días restantes`) : ''}
                </p>
              </div>
              <EstadoBadge estado={s.status} />
              <EstadoBadge estado={s.paymentStatus} />
              <span className="w-28 text-right text-sm font-black tabular-nums">{fmtMoney(s.price, s.currency)}</span>
              {s.status === 'active' && s.paymentStatus === 'pending' && (
                <button type="button" title="Marcar pagada" className={`${F.btn} ${F.btnSuave}`} onClick={() => marcarPagada(s.id)}>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                </button>
              )}
            </div>
          ))}
          <div className="px-4 py-2">
            <Paginador page={subs.page} perPage={subs.perPage} total={subs.total} onPage={(page) => setFiltros((f) => ({ ...f, page }))} />
          </div>
        </div>
      )}
    </div>
  );
}
