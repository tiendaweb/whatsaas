'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { FIN_API, finFetcher } from '../api';
import { EstadoBadge, EstadoVacio, Paginador } from '../componentes';
import { F } from '../estilo';
import { fmtDate, fmtMoney, fmtMoneyMap, fmtUnits } from '../format';
import type { financeOsClienteFicha, financeOsClientes } from '@/lib/plugins/finance/server/os';

type Clientes = Awaited<ReturnType<typeof financeOsClientes>>;
type Ficha = NonNullable<Awaited<ReturnType<typeof financeOsClienteFicha>>>;

export function ClientesView({ clienteId, onAbrirCliente, onCerrarCliente }: { clienteId: number | null; onAbrirCliente: (id: number) => void; onCerrarCliente: () => void }) {
  const [filtros, setFiltros] = useState({ q: '', conDeuda: false, conMembresia: false, page: 1 });
  const params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.conDeuda) params.set('conDeuda', '1');
  if (filtros.conMembresia) params.set('conMembresia', '1');
  params.set('page', String(filtros.page));
  const { data, isLoading } = useSWR<Clientes>(`${FIN_API.clientes}?${params}`, finFetcher, { keepPreviousData: true });
  const set = (patch: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...patch }));

  return (
    <div className="mx-auto flex max-w-6xl gap-4">
      <div className={`min-w-0 flex-1 space-y-4 ${clienteId ? 'hidden xl:block' : ''}`}>
        <div className={`${F.card} flex flex-wrap items-center gap-2 p-3`}>
          <input className={`${F.input} min-w-40 flex-1`} placeholder="Buscar cliente, email o teléfono…" value={filtros.q} onChange={(e) => set({ q: e.target.value })} />
          <button type="button" className={`${F.btn} ${filtros.conDeuda ? F.btnPrimario : F.btnSuave}`} onClick={() => set({ conDeuda: !filtros.conDeuda })}>Con deuda</button>
          <button type="button" className={`${F.btn} ${filtros.conMembresia ? F.btnPrimario : F.btnSuave}`} onClick={() => set({ conMembresia: !filtros.conMembresia })}>Con membresía</button>
        </div>

        {isLoading && !data ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : !data || data.rows.length === 0 ? (
          <EstadoVacio>No hay clientes con estos filtros.</EstadoVacio>
        ) : (
          <div className={`${F.card} divide-y divide-border`}>
            {data.rows.map((c) => {
              const deuda = { ...c.pendingByCurrency };
              for (const [cur, cents] of Object.entries(c.membershipPendingByCurrency)) deuda[cur] = (deuda[cur] ?? 0) + cents;
              return (
                <button key={c.id} type="button" onClick={() => onAbrirCliente(c.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 ${clienteId === c.id ? 'bg-muted/40' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{c.name}</p>
                    <p className="truncate text-[11px] font-bold text-muted-foreground">
                      {[c.email, c.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                      {c.activeMemberships > 0 ? ` · ${c.activeMemberships} membresía${c.activeMemberships > 1 ? 's' : ''}` : ''}
                      {c.nextExpiration ? ` · renueva ${fmtDate(c.nextExpiration)}` : ''}
                    </p>
                  </div>
                  {c.hasDebt ? (
                    <span className="text-right text-sm font-black tabular-nums text-amber-600 dark:text-amber-400">{fmtMoneyMap(deuda)}</span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Al día</span>
                  )}
                </button>
              );
            })}
            <div className="px-4 py-2">
              <Paginador page={data.page} perPage={data.perPage} total={data.total} onPage={(page) => setFiltros((f) => ({ ...f, page }))} />
            </div>
          </div>
        )}
      </div>

      {clienteId ? <FichaCliente clienteId={clienteId} onCerrar={onCerrarCliente} /> : null}
    </div>
  );
}

/** Ficha financiera del cliente: saldos, membresías, movimientos, ventas y pasarela. */
function FichaCliente({ clienteId, onCerrar }: { clienteId: number; onCerrar: () => void }) {
  const { data, isLoading } = useSWR<Ficha>(FIN_API.cliente(clienteId), finFetcher);

  return (
    <aside className={`${F.card} h-fit w-full shrink-0 space-y-4 p-4 xl:w-[420px]`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={F.rotulo}>Ficha del cliente</p>
          <h2 className="truncate text-lg font-black tracking-tight">{data?.customer.name ?? '…'}</h2>
          {data && (
            <p className="text-[11px] font-bold text-muted-foreground">
              {[data.customer.email, data.customer.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <a href={`/plugins/customers/${clienteId}`} target="_blank" rel="noreferrer" className={`${F.btn} ${F.btnSuave}`} title="Abrir ficha completa en Clientes">
            <ExternalLink className="size-4" />
          </a>
          <button type="button" onClick={onCerrar} className={`${F.btn} ${F.btnSuave}`} aria-label="Cerrar ficha"><X className="size-4" /></button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-amber-500/10 p-3">
              <p className={F.rotulo}>Pendiente</p>
              <p className="mt-1 text-sm font-black tabular-nums">{fmtMoneyMap(data.pendingByCurrency)}</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/10 p-3">
              <p className={F.rotulo}>Cobrado</p>
              <p className="mt-1 text-sm font-black tabular-nums">{fmtMoneyMap(data.paidByCurrency)}</p>
            </div>
          </div>

          <Seccion titulo={`Membresías (${data.subscriptions.length})`}>
            {data.subscriptions.length === 0 && <p className="text-xs font-bold text-muted-foreground">Sin membresías.</p>}
            {data.subscriptions.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{s.planNameSnapshot || 'Plan'}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">{s.endDate ? `hasta ${fmtDate(s.endDate)}` : 'sin vencimiento'}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <EstadoBadge estado={s.status} />
                  <EstadoBadge estado={s.paymentStatus} />
                  <span className="text-xs font-black tabular-nums">{fmtMoney(s.price, s.currency)}</span>
                </div>
              </div>
            ))}
          </Seccion>

          <Seccion titulo={`Movimientos (${data.entries.length})`}>
            {data.entries.length === 0 && <p className="text-xs font-bold text-muted-foreground">Sin movimientos.</p>}
            {data.entries.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{e.title}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">{fmtDate(e.occurredOn)} · {e.category}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <EstadoBadge estado={e.status} overdue={e.overdue} />
                  <span className={`text-xs font-black tabular-nums ${e.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {e.type === 'income' ? '+' : '−'}{fmtMoney(e.amount, e.currency)}
                  </span>
                </div>
              </div>
            ))}
          </Seccion>

          {data.sales.length > 0 && (
            <Seccion titulo={`Ventas (${data.sales.length})`}>
              {data.sales.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                  <p className="text-xs font-bold">{s.saleNumber}</p>
                  <div className="flex items-center gap-1.5">
                    <EstadoBadge estado={s.status} />
                    <span className="text-xs font-black tabular-nums">{fmtMoney(s.total, s.currency)}</span>
                  </div>
                </div>
              ))}
            </Seccion>
          )}

          {data.transactions.length > 0 && (
            <Seccion titulo={`Pagos por pasarela (${data.transactions.length})`}>
              {data.transactions.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{t.gateway || 'Pasarela'}</p>
                    <p className="text-[10px] font-bold text-muted-foreground">{t.date ? fmtDate(new Date(t.date)) : '—'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <EstadoBadge estado={t.paymentStatus ?? ''} />
                    <span className="text-xs font-black tabular-nums">{fmtUnits(t.amountUnits, t.currency)}</span>
                  </div>
                </div>
              ))}
            </Seccion>
          )}
        </>
      )}
    </aside>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3">
      <p className={F.rotulo}>{titulo}</p>
      <div className="mt-1 divide-y divide-border/60">{children}</div>
    </div>
  );
}
