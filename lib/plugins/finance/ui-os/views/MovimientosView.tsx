'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { FIN_API, finFetcher } from '../api';
import { EstadoBadge, EstadoVacio, Paginador } from '../componentes';
import { F } from '../estilo';
import { fmtDate, fmtMoney, fmtMoneyMap, fmtMonth } from '../format';
import type { financeOsMovimientos } from '@/lib/plugins/finance/server/os';

type Movimientos = Awaited<ReturnType<typeof financeOsMovimientos>>;

const HOY = () => new Date().toISOString().slice(0, 10);

export function MovimientosView() {
  const [filtros, setFiltros] = useState({ type: '', status: '', currency: '', category: '', month: '', q: '', page: 1 });
  const [nuevo, setNuevo] = useState(false);

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) params.set(k, String(v));
  const { data, isLoading, mutate } = useSWR<Movimientos>(`${FIN_API.movimientos}?${params}`, finFetcher, { keepPreviousData: true });

  const set = (patch: Partial<typeof filtros>) => setFiltros((f) => ({ ...f, page: 1, ...patch }));

  const marcarPagado = async (id: number) => {
    const res = await fetch(FIN_API.entry(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid' }) });
    if (!res.ok) return toast.error('No se pudo marcar como pagado');
    toast.success('Movimiento marcado como pagado');
    mutate();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Filtros */}
      <div className={`${F.card} flex flex-wrap items-center gap-2 p-3`}>
        <input className={`${F.input} min-w-40 flex-1`} placeholder="Buscar título, cliente, contraparte…" value={filtros.q} onChange={(e) => set({ q: e.target.value })} />
        <select className={F.select} value={filtros.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">Ingresos y egresos</option>
          <option value="income">Ingresos</option>
          <option value="expense">Egresos</option>
        </select>
        <select className={F.select} value={filtros.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="paid">Pagados</option>
          <option value="pending">Pendientes</option>
          <option value="overdue">Vencidos</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <select className={F.select} value={filtros.currency} onChange={(e) => set({ currency: e.target.value })}>
          <option value="">Todas las monedas</option>
          {(data?.facets.currencies ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className={F.select} value={filtros.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Todas las categorías</option>
          {(data?.facets.categories ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className={F.select} value={filtros.month} onChange={(e) => set({ month: e.target.value })}>
          <option value="">Todos los meses</option>
          {(data?.facets.months ?? []).map((m) => (
            <option key={m} value={m}>{fmtMonth(m)}</option>
          ))}
        </select>
        <button type="button" className={`${F.btn} ${F.btnPrimario}`} onClick={() => setNuevo(true)}>
          <Plus className="size-4" /> Nuevo
        </button>
      </div>

      {/* Totales de lo filtrado */}
      {data && (
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className={F.chip}>Ingresos: {fmtMoneyMap(data.totals.income)}</span>
          <span className={F.chip}>Egresos: {fmtMoneyMap(data.totals.expense)}</span>
        </div>
      )}

      {nuevo && <NuevoMovimiento categorias={data?.facets.categories ?? []} onClose={() => setNuevo(false)} onCreado={() => { setNuevo(false); mutate(); }} />}

      {isLoading && !data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : !data || data.rows.length === 0 ? (
        <EstadoVacio>No hay movimientos con estos filtros.</EstadoVacio>
      ) : (
        <div className={`${F.card} divide-y divide-border`}>
          {data.rows.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{e.title}</p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  {fmtDate(e.occurredOn)} · {e.category}
                  {e.customerName ? ` · ${e.customerName}` : e.counterparty ? ` · ${e.counterparty}` : ''}
                  {e.dueOn && e.status !== 'paid' ? ` · vence ${fmtDate(e.dueOn)}` : ''}
                </p>
              </div>
              <EstadoBadge estado={e.status} overdue={e.overdue} />
              <span className={`w-32 text-right text-sm font-black tabular-nums ${e.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {e.type === 'income' ? '+' : '−'}{fmtMoney(e.amount, e.currency)}
              </span>
              {(e.status === 'pending' || e.status === 'overdue') && (
                <button type="button" title="Marcar pagado" className={`${F.btn} ${F.btnSuave}`} onClick={() => marcarPagado(e.id)}>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                </button>
              )}
            </div>
          ))}
          <div className="px-4 py-2">
            <Paginador page={data.page} perPage={data.perPage} total={data.total} onPage={(page) => setFiltros((f) => ({ ...f, page }))} />
          </div>
        </div>
      )}
    </div>
  );
}

function NuevoMovimiento({ categorias, onClose, onCreado }: { categorias: string[]; onClose: () => void; onCreado: () => void }) {
  const [form, setForm] = useState({ type: 'income', title: '', category: '', amount: '', currency: 'ARS', status: 'paid', occurredOn: HOY(), dueOn: '', counterparty: '' });
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    const amount = Math.round(Number(form.amount.replace(',', '.')) * 100);
    if (!form.title.trim() || !form.category.trim() || !Number.isFinite(amount) || amount <= 0) {
      return toast.error('Completá título, categoría y un importe válido');
    }
    setEnviando(true);
    const res = await fetch(FIN_API.entries, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: form.type,
        title: form.title.trim(),
        category: form.category.trim(),
        amount,
        currency: form.currency,
        status: form.status,
        occurredOn: form.occurredOn,
        dueOn: form.dueOn || null,
        counterparty: form.counterparty.trim() || null,
      }),
    });
    setEnviando(false);
    if (!res.ok) return toast.error('No se pudo crear el movimiento');
    toast.success('Movimiento creado');
    onCreado();
  };

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className={`${F.card} space-y-3 border-emerald-600/30 p-4`}>
      <div className="flex items-center justify-between">
        <span className={F.rotulo}>Nuevo movimiento</span>
        <button type="button" onClick={onClose} className={`${F.btn} ${F.btnSuave}`} aria-label="Cerrar"><X className="size-4" /></button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select className={F.select} value={form.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="income">Ingreso</option>
          <option value="expense">Egreso</option>
        </select>
        <input className={F.input} placeholder="Título *" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        <input className={F.input} placeholder="Categoría *" list="fin-os-categorias" value={form.category} onChange={(e) => set({ category: e.target.value })} />
        <datalist id="fin-os-categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        <input className={F.input} placeholder="Importe * (ej. 150000)" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
        <select className={F.select} value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
          {['ARS', 'PYG', 'USD', 'EUR', 'BRL'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={F.select} value={form.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="paid">Pagado</option>
          <option value="pending">Pendiente</option>
        </select>
        <input className={F.input} type="date" value={form.occurredOn} onChange={(e) => set({ occurredOn: e.target.value })} />
        <input className={F.input} type="date" value={form.dueOn} onChange={(e) => set({ dueOn: e.target.value })} title="Vencimiento (opcional)" />
        <input className={`${F.input} sm:col-span-2`} placeholder="Contraparte (opcional)" value={form.counterparty} onChange={(e) => set({ counterparty: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={`${F.btn} ${F.btnSuave}`} onClick={onClose}>Cancelar</button>
        <button type="button" className={`${F.btn} ${F.btnPrimario}`} disabled={enviando} onClick={guardar}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : null} Guardar
        </button>
      </div>
    </div>
  );
}
