'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Check, Pencil, AlertTriangle } from 'lucide-react';
import { Panel, SectionHeader } from '../components/shared';

type SaleItem = { _recordId: string; client: string; amount: string; currency: string; status: string; paid: boolean; clientId?: string; date?: string; description?: string; category?: string };
type PaymentItem = { _recordId: string; concept: string; amount: string; currency: string; dueDate: string; paid: boolean };
type DomainItem = { _recordId: string; domain: string; client: string; status: string; dueDate: string; done: boolean };
type ClientItem = { _recordId: string; name: string; phone?: string };

const CURRENCIES = ['USD', 'MXN', 'ARS', 'EUR', 'COP'];
const SALE_STATUSES: { value: string; label: string; cls: string }[] = [
  { value: 'pendiente', label: 'Pendiente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'en_proceso', label: 'En proceso', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'cobrado', label: 'Cobrado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'cancelado', label: 'Cancelado', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
];
const DOMAIN_STATUSES: { value: string; label: string; cls: string }[] = [
  { value: 'activo', label: 'Activo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'por_renovar', label: 'Por renovar', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'vencido', label: 'Vencido', cls: 'bg-red-50 text-red-700 border-red-200' },
];

const fieldCls = 'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-200';
const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500';

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function fmtDate(value?: string) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(value?: string) {
  if (!value) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// Agrupa montos por moneda y los muestra como "USD 100 · MXN 50"
function sumByCurrency(items: { amount: string; currency: string }[]) {
  const totals = new Map<string, number>();
  items.forEach((it) => {
    const amt = parseFloat(it.amount) || 0;
    totals.set(it.currency || 'USD', (totals.get(it.currency || 'USD') ?? 0) + amt);
  });
  return [...totals.entries()];
}

export function SalesView({ sales, payments, domains, clients, onSalesChange, onPaymentsChange, onDomainsChange }: {
  sales: SaleItem[];
  payments: PaymentItem[];
  domains: DomainItem[];
  clients: ClientItem[];
  onSalesChange: (items: SaleItem[]) => void;
  onPaymentsChange: (items: PaymentItem[]) => void;
  onDomainsChange: (items: DomainItem[]) => void;
}) {
  const [subTab, setSubTab] = useState<'ventas' | 'pagos' | 'dominios'>('ventas');

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(['ventas', 'pagos', 'dominios'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${subTab === t ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow' : 'border border-white/50 bg-white/70 text-zinc-700 hover:bg-white'}`}
          >
            {t === 'ventas' ? 'Ventas' : t === 'pagos' ? 'Pagos' : 'Dominios'}
          </button>
        ))}
      </div>

      {subTab === 'ventas' && <SalesTab sales={sales} clients={clients} onChange={onSalesChange} />}
      {subTab === 'pagos' && <PaymentsTab payments={payments} onChange={onPaymentsChange} />}
      {subTab === 'dominios' && <DomainsTab domains={domains} clients={clients} onChange={onDomainsChange} />}
    </div>
  );
}

/* ---------------- VENTAS ---------------- */
function SalesTab({ sales, clients, onChange }: { sales: SaleItem[]; clients: ClientItem[]; onChange: (items: SaleItem[]) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const blank = { client: '', description: '', amount: '', currency: 'USD', status: 'pendiente', date: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState(blank);

  const cobradoTotals = useMemo(() => sumByCurrency(sales.filter((s) => s.status === 'cobrado' || s.paid)), [sales]);
  const pendienteTotals = useMemo(() => sumByCurrency(sales.filter((s) => s.status !== 'cobrado' && s.status !== 'cancelado' && !s.paid)), [sales]);

  function startEdit(s: SaleItem) {
    setEditingId(s._recordId);
    setForm({ client: s.client, description: s.description ?? '', amount: s.amount, currency: s.currency, status: s.status, date: s.date ?? '' });
    setShowAdd(false);
  }

  function save() {
    if (!form.client.trim() && !form.description.trim()) return;
    if (editingId) {
      onChange(sales.map((s) => (s._recordId === editingId ? { ...s, client: form.client.trim(), description: form.description.trim(), amount: form.amount, currency: form.currency, status: form.status, date: form.date, paid: form.status === 'cobrado' } : s)));
      setEditingId(null);
    } else {
      onChange([{ _recordId: makeId(), client: form.client.trim(), description: form.description.trim(), amount: form.amount, currency: form.currency, status: form.status, date: form.date, paid: form.status === 'cobrado' }, ...sales]);
      setShowAdd(false);
    }
    setForm(blank);
  }

  function togglePaid(s: SaleItem) {
    const paid = !(s.paid || s.status === 'cobrado');
    onChange(sales.map((x) => (x._recordId === s._recordId ? { ...x, paid, status: paid ? 'cobrado' : (x.status === 'cobrado' ? 'pendiente' : x.status) } : x)));
  }

  const editor = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelCls}>Cliente</label>
        <input list="bw-sales-clients" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="Nombre del cliente" className={fieldCls} />
        <datalist id="bw-sales-clients">{clients.map((c) => <option key={c._recordId} value={c.name} />)}</datalist>
      </div>
      <div><label className={labelCls}>Descripción</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ej. Sitio web" className={fieldCls} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Monto</label><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} type="number" inputMode="decimal" placeholder="0.00" className={fieldCls} /></div>
        <div><label className={labelCls}>Moneda</label><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={fieldCls}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Estado</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={fieldCls}>{SALE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
        <div><label className={labelCls}>Fecha</label><input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" className={fieldCls} /></div>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button onClick={() => { setShowAdd(false); setEditingId(null); setForm(blank); }} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancelar</button>
        <button onClick={save} className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white shadow">{editingId ? 'Guardar cambios' : 'Agregar venta'}</button>
      </div>
    </div>
  );

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="Ventas">
        {!showAdd && !editingId && <button onClick={() => { setForm(blank); setShowAdd(true); }} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow"><Plus className="h-4 w-4" /> Nueva venta</button>}
      </SectionHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ventas</div><div className="text-2xl font-black text-zinc-900">{sales.length}</div></div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Cobrado</div><div className="text-sm font-black text-emerald-700">{cobradoTotals.length ? cobradoTotals.map(([c, a]) => fmtMoney(a, c)).join(' · ') : '—'}</div></div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-amber-600">Pendiente</div><div className="text-sm font-black text-amber-700">{pendienteTotals.length ? pendienteTotals.map(([c, a]) => fmtMoney(a, c)).join(' · ') : '—'}</div></div>
      </div>

      {(showAdd || editingId) && <div className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">{editor}</div>}

      {sales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/40 py-10 text-center text-sm text-zinc-500">Aún no hay ventas registradas.</div>
      ) : (
        <div className="space-y-2">
          {sales.map((s) => editingId === s._recordId ? null : (
            <div key={s._recordId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3">
              <button onClick={() => togglePaid(s)} title={s.paid || s.status === 'cobrado' ? 'Marcar como pendiente' : 'Marcar como cobrado'} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${s.paid || s.status === 'cobrado' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-300 hover:border-emerald-400'}`}>{(s.paid || s.status === 'cobrado') && <Check className="h-4 w-4" />}</button>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-zinc-900">{s.client || s.description || 'Venta'}</div>
                {s.description && s.client && <div className="truncate text-xs text-zinc-500">{s.description}</div>}
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SALE_STATUSES.find((x) => x.value === s.status)?.cls ?? 'border-zinc-200 text-zinc-500'}`}>{SALE_STATUSES.find((x) => x.value === s.status)?.label ?? s.status}</span>
                  {s.date && <span>{fmtDate(s.date)}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right font-bold tabular-nums text-emerald-600">{fmtMoney(parseFloat(s.amount) || 0, s.currency)}</div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => startEdit(s)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-500"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => onChange(sales.filter((x) => x._recordId !== s._recordId))} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- PAGOS ---------------- */
function PaymentsTab({ payments, onChange }: { payments: PaymentItem[]; onChange: (items: PaymentItem[]) => void }) {
  const blank = { concept: '', amount: '', currency: 'USD', dueDate: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState(blank);
  const [showAdd, setShowAdd] = useState(false);
  const pendingTotals = useMemo(() => sumByCurrency(payments.filter((p) => !p.paid)), [payments]);

  function save() {
    if (!form.concept.trim()) return;
    onChange([{ _recordId: makeId(), concept: form.concept.trim(), amount: form.amount, currency: form.currency, dueDate: form.dueDate, paid: false }, ...payments]);
    setForm(blank);
    setShowAdd(false);
  }

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="Pagos por cobrar / vencimientos">
        {!showAdd && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow"><Plus className="h-4 w-4" /> Nuevo pago</button>}
      </SectionHeader>

      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3"><div className="text-xs font-semibold uppercase tracking-wide text-amber-600">Pendiente por pagar</div><div className="text-sm font-black text-amber-700">{pendingTotals.length ? pendingTotals.map(([c, a]) => fmtMoney(a, c)).join(' · ') : '—'}</div></div>

      {showAdd && (
        <div className="mb-4 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={labelCls}>Concepto</label><input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Ej. Hosting anual" className={fieldCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Monto</label><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} type="number" inputMode="decimal" placeholder="0.00" className={fieldCls} /></div>
            <div><label className={labelCls}>Moneda</label><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={fieldCls}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div><label className={labelCls}>Vence</label><input value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} type="date" className={fieldCls} /></div>
          <div className="flex items-end justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setForm(blank); }} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancelar</button>
            <button onClick={save} className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white shadow">Agregar</button>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/40 py-10 text-center text-sm text-zinc-500">Sin pagos registrados.</div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const overdue = !p.paid && isOverdue(p.dueDate);
            return (
              <div key={p._recordId} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${overdue ? 'border-red-200 bg-red-50/50' : 'border-zinc-200 bg-white/80'}`}>
                <button onClick={() => onChange(payments.map((x) => (x._recordId === p._recordId ? { ...x, paid: !x.paid } : x)))} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${p.paid ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-300 hover:border-emerald-400'}`}>{p.paid && <Check className="h-4 w-4" />}</button>
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-semibold ${p.paid ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{p.concept}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">{overdue && <AlertTriangle className="h-3 w-3 text-red-500" />}<span className={overdue ? 'font-semibold text-red-600' : ''}>Vence {fmtDate(p.dueDate)}</span></div>
                </div>
                <div className="shrink-0 text-right font-bold tabular-nums text-zinc-800">{fmtMoney(parseFloat(p.amount) || 0, p.currency)}</div>
                <button onClick={() => onChange(payments.filter((x) => x._recordId !== p._recordId))} className="shrink-0 rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- DOMINIOS ---------------- */
function DomainsTab({ domains, clients, onChange }: { domains: DomainItem[]; clients: ClientItem[]; onChange: (items: DomainItem[]) => void }) {
  const blank = { domain: '', client: '', status: 'activo', dueDate: '' };
  const [form, setForm] = useState(blank);
  const [showAdd, setShowAdd] = useState(false);

  function save() {
    if (!form.domain.trim()) return;
    onChange([{ _recordId: makeId(), domain: form.domain.trim(), client: form.client.trim(), status: form.status, dueDate: form.dueDate, done: false }, ...domains]);
    setForm(blank);
    setShowAdd(false);
  }

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="Dominios">
        {!showAdd && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow"><Plus className="h-4 w-4" /> Nuevo dominio</button>}
      </SectionHeader>

      {showAdd && (
        <div className="mb-4 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:grid-cols-2">
          <div><label className={labelCls}>Dominio</label><input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="ejemplo.com" className={fieldCls} /></div>
          <div>
            <label className={labelCls}>Cliente</label>
            <input list="bw-domain-clients" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="Cliente" className={fieldCls} />
            <datalist id="bw-domain-clients">{clients.map((c) => <option key={c._recordId} value={c.name} />)}</datalist>
          </div>
          <div><label className={labelCls}>Estado</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={fieldCls}>{DOMAIN_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          <div><label className={labelCls}>Renovación</label><input value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} type="date" className={fieldCls} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button onClick={() => { setShowAdd(false); setForm(blank); }} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancelar</button>
            <button onClick={save} className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white shadow">Agregar</button>
          </div>
        </div>
      )}

      {domains.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/40 py-10 text-center text-sm text-zinc-500">Sin dominios registrados.</div>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => {
            const overdue = !d.done && isOverdue(d.dueDate);
            return (
              <div key={d._recordId} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${overdue ? 'border-red-200 bg-red-50/50' : 'border-zinc-200 bg-white/80'}`}>
                <button onClick={() => onChange(domains.map((x) => (x._recordId === d._recordId ? { ...x, done: !x.done } : x)))} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${d.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-300 hover:border-emerald-400'}`}>{d.done && <Check className="h-4 w-4" />}</button>
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-semibold ${d.done ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{d.domain}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    {d.client && <span>{d.client}</span>}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${DOMAIN_STATUSES.find((x) => x.value === d.status)?.cls ?? 'border-zinc-200 text-zinc-500'}`}>{DOMAIN_STATUSES.find((x) => x.value === d.status)?.label ?? d.status}</span>
                    {d.dueDate && <span className={overdue ? 'font-semibold text-red-600' : ''}>Renueva {fmtDate(d.dueDate)}</span>}
                  </div>
                </div>
                <button onClick={() => onChange(domains.filter((x) => x._recordId !== d._recordId))} className="shrink-0 rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
