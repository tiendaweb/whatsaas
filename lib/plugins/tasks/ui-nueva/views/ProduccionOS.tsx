'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  CircleDashed,
  ExternalLink,
  Factory,
  Globe2,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  UserRound,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ProductionOrder, ProductionOsPayload } from '@/lib/plugins/tasks/server/production-os';
import {
  FAMILIA_LABEL,
  WORK_KIND_META,
  WORK_STATUS_META,
  WORK_STATUS_ORDER,
  WORK_STATUS_TRANSITIONS,
  type Familia,
  type WorkKind,
  type WorkStatus,
} from '@/lib/plugins/tasks/shared/produccion';
import { C } from '../data/clases';
import { ProductionFocusView } from './ProductionFocusView';

const API = '/api/plugins/tasks/production';
const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
  return body;
};

type FamilyFilter = 'all' | Familia;
type StatusFilter = 'open' | 'all' | WorkStatus;

const FAMILY_ICON = { demo: Globe2, produccion: Factory, cambio: Wrench } as const;
const STATUS_TONE: Record<WorkStatus, string> = {
  pedido: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  aceptado: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  en_curso: 'border-primary/30 bg-primary/10 text-primary',
  espera_cliente: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  entregado: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cambios: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  descartado: 'border-border bg-muted text-muted-foreground',
};

function fecha(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
}

function isOpen(order: ProductionOrder) {
  return WORK_STATUS_META[order.workStatus].abierto;
}

export function ProduccionOS({ onOpenTask, embedded = false, focusRequest = 0 }: { onOpenTask?: (taskId: number) => void; embedded?: boolean; focusRequest?: number }) {
  const { data, error, isLoading, mutate } = useSWR<ProductionOsPayload>(API, fetcher, { refreshInterval: 30_000, revalidateOnFocus: false });
  const [family, setFamily] = useState<FamilyFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [handledFocusRequest, setHandledFocusRequest] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return (data?.orders ?? []).filter((order) => {
      if (family !== 'all' && order.family !== family) return false;
      if (status === 'open' && !isOpen(order)) return false;
      if (status !== 'all' && status !== 'open' && order.workStatus !== status) return false;
      if (!needle) return true;
      return [order.title, order.projectName, order.workspaceName ?? '', order.notes, ...order.parties.map((party) => party.name)]
        .some((value) => value.toLocaleLowerCase('es').includes(needle));
    });
  }, [data?.orders, family, query, status]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((order) => order.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((order) => order.id === selectedId) ?? null;
  // Focus siempre trabaja la cola abierta completa. Los filtros de la vista
  // general sirven para explorar, pero no deben esconder demos o clientes al
  // entrar en una sesión operativa.
  const focusOrders = (data?.orders ?? []).filter(isOpen);
  const refresh = () => void mutate();

  useEffect(() => {
    if (!focusRequest || handledFocusRequest === focusRequest || !data) return;
    setHandledFocusRequest(focusRequest);
    if (!focusOrders.length) {
      toast.info('No hay pedidos abiertos para enfocar.');
      return;
    }
    setFocusOpen(true);
  }, [data, focusOrders.length, focusRequest, handledFocusRequest]);

  if (error) {
    return (
      <StateCard icon={AlertTriangle} title="No pudimos cargar Producción OS" detail={error instanceof Error ? error.message : 'Error inesperado'}>
        <Button type="button" variant="outline" size="sm" onClick={refresh}>Reintentar</Button>
      </StateCard>
    );
  }

  if (focusOpen && data && focusOrders.length) {
    return (
      <ProductionFocusView
        orders={focusOrders}
        initialOrderId={selected && isOpen(selected) ? selected.id : focusOrders[0].id}
        members={data.members}
        onClose={() => setFocusOpen(false)}
        onChanged={refresh}
      />
    );
  }

  return (
    <div className={cn(
      'mx-auto min-h-full max-w-[1600px]',
      embedded
        ? 'px-0 py-1 pb-8 [--tareas-accent:var(--primary)] [--t-bg:var(--background)] [--t-surface:var(--card)] [--t-surface-2:var(--muted)] [--t-text:var(--foreground)] [--t-text-secondary:var(--muted-foreground)] [--t-muted:var(--muted-foreground)] [--t-border:var(--border)] [--t-border-2:var(--border)] [--t-hover:var(--muted)] [--t-chip:var(--muted)]'
        : 'px-3 py-4 pb-28 sm:px-5 lg:px-6 lg:py-6',
    )}>
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-primary">
            <Factory className="size-3.5" aria-hidden /> Producción OS
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--t-text)] sm:text-3xl">Del pedido a la entrega, sin perder el contexto</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--t-text-secondary)]">Demos, trabajos vendidos y cambios viven en las mismas tareas. La cola dice qué sigue; el Focus concentra un trabajo por vez.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Button type="button" className="gap-2 rounded-xl" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Nuevo pedido
          </Button>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi icon={CircleDashed} label="Trabajo abierto" value={data?.counts.open ?? 0} />
        <Kpi icon={UserRound} label="Sin responsable" value={data?.counts.unassigned ?? 0} emphasis={Boolean(data?.counts.unassigned)} />
        <Kpi icon={UsersRound} label="Esperando cliente" value={data?.counts.waitingCustomer ?? 0} />
        <Kpi icon={CalendarClock} label="Vencidos" value={data?.counts.due ?? 0} emphasis={Boolean(data?.counts.due)} />
      </div>

      <section className={cn(C.card, 'overflow-hidden rounded-2xl')}>
        <div className="border-b border-[var(--t-border)] p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(['all', 'demo', 'produccion', 'cambio'] as FamilyFilter[]).map((value) => {
                const Icon = value === 'all' ? Factory : FAMILY_ICON[value];
                const label = value === 'all' ? 'Todo' : FAMILIA_LABEL[value];
                const count = value === 'all' ? data?.counts.open ?? 0 : data?.counts.byFamily[value] ?? 0;
                return (
                  <button key={value} type="button" onClick={() => setFamily(value)} className={cn(C.chip, family === value && 'border-primary/40 bg-primary/10 text-primary')}>
                    <Icon className="size-3.5" aria-hidden /> {label} <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row xl:justify-end">
              <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-10 rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 text-sm font-semibold text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30">
                <option value="open">Abiertos</option>
                <option value="all">Todos los estados</option>
                {WORK_STATUS_ORDER.map((value) => <option key={value} value={value}>{WORK_STATUS_META[value].label}</option>)}
              </select>
              <label className="relative min-w-0 flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--t-muted)]" aria-hidden />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, proyecto o cliente…" className="h-10 w-full rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] pl-9 pr-3 text-sm text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
            </div>
          </div>
        </div>

        {isLoading && !data ? (
          <div className="flex min-h-[420px] items-center justify-center gap-2 text-sm text-[var(--t-muted)]"><Loader2 className="size-4 animate-spin" /> Cargando producción…</div>
        ) : filtered.length === 0 ? (
          <StateCard icon={PackageCheck} title="No hay pedidos en este recorte" detail="Cambiá el estado o el tipo, limpiá la búsqueda o creá un pedido nuevo." />
        ) : (
          <div className="grid min-h-[620px] lg:grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.45fr)] 2xl:grid-cols-[340px_minmax(520px,1.4fr)_320px]">
            <Queue orders={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            {selected && <ProductionOrderWorkspace order={selected} members={data?.members ?? []} onChanged={refresh} onOpenTask={onOpenTask} />}
            {selected && <NextPanel order={selected} className="hidden 2xl:block" />}
          </div>
        )}
      </section>

      {creating && data && <CreateOrder targets={data.targets} members={data.members} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setStatus('open'); setSelectedId(id); refresh(); }} />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, emphasis }: { icon: typeof Factory; label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={cn('rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-3 sm:p-4', emphasis && 'border-amber-500/30')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">{label}</p>
        <Icon className={cn('size-4 text-[var(--t-muted)]', emphasis && 'text-amber-600')} aria-hidden />
      </div>
      <p className="mt-1 text-2xl font-black tabular-nums text-[var(--t-text)]">{value}</p>
    </div>
  );
}

function Queue({ orders, selectedId, onSelect }: { orders: ProductionOrder[]; selectedId: number | null; onSelect: (id: number) => void }) {
  return (
    <aside className="max-h-[620px] overflow-y-auto border-b border-[var(--t-border)] bg-[var(--t-surface-2)]/50 p-2 lg:border-b-0 lg:border-r">
      <div className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t-muted)]">Cola priorizada · {orders.length}</div>
      <div className="space-y-1.5">
        {orders.map((order) => {
          const Icon = FAMILY_ICON[order.family];
          const active = order.id === selectedId;
          return (
            <button key={order.id} type="button" onClick={() => onSelect(order.id)} className={cn('w-full rounded-xl border p-3 text-left transition-colors', active ? 'border-primary/40 bg-primary/10' : 'border-transparent hover:border-[var(--t-border)] hover:bg-[var(--t-surface)]')}>
              <div className="flex items-start gap-2.5">
                <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border', STATUS_TONE[order.workStatus])}><Icon className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-bold leading-snug text-[var(--t-text)]">{order.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-[var(--t-muted)]">
                    <span>{WORK_STATUS_META[order.workStatus].label}</span><span>·</span><span className="truncate">{order.projectName}</span>
                    {order.dueDate && <><span>·</span><span>{fecha(order.dueDate)}</span></>}
                  </span>
                  {order.assigneeName ? <span className="mt-1 block truncate text-[11px] font-semibold text-[var(--t-text-secondary)]">{order.assigneeName}</span> : <span className="mt-1 block text-[11px] font-semibold text-amber-600">Sin responsable</span>}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function ProductionOrderWorkspace({ order, members, onChanged, onOpenTask, focusMode = false }: { order: ProductionOrder; members: ProductionOsPayload['members']; onChanged: () => void; onOpenTask?: (id: number) => void; focusMode?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [blockedReason, setBlockedReason] = useState(order.blockedReason ?? '');
  const [deliveryUrl, setDeliveryUrl] = useState(order.deliveryUrl ?? '');
  useEffect(() => { setBlockedReason(order.blockedReason ?? ''); setDeliveryUrl(order.deliveryUrl ?? ''); }, [order.id, order.blockedReason, order.deliveryUrl]);

  const patch = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const response = await fetch(`${API}/${order.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
      toast.success(success);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar.');
    } finally {
      setBusy(false);
    }
  };
  const transition = (next: WorkStatus) => {
    if (next === 'espera_cliente' && !blockedReason.trim()) {
      toast.error('Escribí qué falta del cliente.');
      return;
    }
    if (next === 'entregado' && !deliveryUrl.trim()) {
      toast.error('Pegá el enlace de entrega.');
      return;
    }
    void patch({ workStatus: next, ...(next === 'espera_cliente' ? { blockedReason } : {}), ...(next === 'entregado' ? { deliveryUrl } : {}) }, `Pedido marcado como ${WORK_STATUS_META[next].label.toLocaleLowerCase('es')}.`);
  };

  return (
    <article className="min-w-0 border-b border-[var(--t-border)] bg-[var(--t-surface)] p-4 lg:border-b-0 2xl:border-r sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold', STATUS_TONE[order.workStatus])}>{WORK_STATUS_META[order.workStatus].label}</span>
            <span className="text-xs font-semibold text-[var(--t-muted)]">{WORK_KIND_META[order.workKind].corto}</span>
          </div>
          <h2 className="mt-3 text-xl font-black leading-tight text-[var(--t-text)] sm:text-2xl">{order.title}</h2>
          <p className="mt-1 text-xs text-[var(--t-muted)]">{order.workspaceName} · {order.projectName}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {onOpenTask && <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenTask(order.id)}>Abrir tarea <ExternalLink className="size-3.5" /></Button>}
          <a href={`/plugins/tasks?proyecto=${order.projectId}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">Tablero <ExternalLink className="size-3.5" /></a>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">Responsable</span><select value={order.assigneeId ?? ''} disabled={busy} onChange={(event) => void patch({ assigneeId: event.target.value ? Number(event.target.value) : null }, 'Responsable actualizado.')} className={cn(C.control, 'border border-[var(--t-border)]')}><option value="">Sin asignar</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <div className="space-y-1.5"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">Pedido por</span><div className={cn(C.control, 'border border-[var(--t-border)]')}>{order.requestedByName ?? 'Sin registro'}</div></div>
      </div>

      {order.parties.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{order.parties.map((party) => party.chatId ? <a key={`${party.type}-${party.id}`} href={`/dashboard/chat/${party.chatId}`} className={C.chip}><UserRound className="size-3.5" /> {party.name} <ExternalLink className="size-3" /></a> : <span key={`${party.type}-${party.id}`} className={C.chip}><UserRound className="size-3.5" /> {party.name}</span>)}</div>}

      <section className="mt-5 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-black text-[var(--t-text)]">Checklist de entrega</h3><span className="text-xs font-bold tabular-nums text-[var(--t-muted)]">{order.checklistDone}/{order.checklist.length}</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--t-hover)]"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(order.progress * 100)}%` }} /></div>
        <div className="mt-3 space-y-1">
          {order.checklist.length ? order.checklist.map((item, index) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-xl px-2 py-2 hover:bg-[var(--t-hover)]">
              <input type="checkbox" checked={item.completed} disabled={busy} onChange={() => { const checklist = order.checklist.map((step, i) => i === index ? { ...step, completed: !step.completed } : step); void patch({ checklist }, 'Checklist actualizado.'); }} className="mt-0.5 size-4 accent-[var(--tareas-accent)]" />
              <span className={cn('text-sm text-[var(--t-text)]', item.completed && 'line-through opacity-55')}>{item.text}</span>
            </label>
          )) : <p className="text-sm text-[var(--t-muted)]">Este pedido histórico no tiene checklist. Abrí la tarea para agregar pasos.</p>}
        </div>
      </section>

      {order.notes && <section className="mt-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">Contexto</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--t-text-secondary)]">{order.notes}</p></section>}
      {order.aiPrompt && <details className="mt-4 rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-3"><summary className="cursor-pointer text-sm font-bold text-[var(--t-text)]"><Bot className="mr-2 inline size-4 text-primary" />Prompt para producir</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-5 text-[var(--t-text-secondary)]">{order.aiPrompt}</pre></details>}

      <section className="mt-5 space-y-3 border-t border-[var(--t-border)] pt-5">
        <div><h3 className="text-sm font-black text-[var(--t-text)]">Siguiente movimiento</h3><p className="text-xs text-[var(--t-muted)]">{WORK_STATUS_META[order.workStatus].ayuda}</p></div>
        {WORK_STATUS_TRANSITIONS[order.workStatus].includes('espera_cliente') && <Textarea value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} rows={2} placeholder="Qué falta del cliente: logo, textos, acceso, seña…" className="rounded-xl" />}
        {WORK_STATUS_TRANSITIONS[order.workStatus].includes('entregado') && <Input value={deliveryUrl} onChange={(event) => setDeliveryUrl(event.target.value)} type="url" placeholder="https://… enlace de la entrega" className="rounded-xl" />}
        <div className="flex flex-wrap gap-2">
          {WORK_STATUS_TRANSITIONS[order.workStatus].map((next, index) => (
            <Button key={next} type="button" disabled={busy} variant={index === 0 ? 'default' : next === 'descartado' ? 'ghost' : 'outline'} size="sm" className="gap-1.5" onClick={() => transition(next)}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : next === 'entregado' ? <Check className="size-3.5" /> : <ArrowRight className="size-3.5" />}{WORK_STATUS_META[next].label}
            </Button>
          ))}
        </div>
      </section>
      {!focusMode && <NextPanel order={order} className="mt-5 2xl:hidden" />}
    </article>
  );
}

function NextPanel({ order, className }: { order: ProductionOrder; className?: string }) {
  return (
    <aside className={cn('bg-[var(--t-surface-2)]/40 p-5', className)}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t-muted)]">Focus</p>
      <h3 className="mt-2 text-lg font-black text-[var(--t-text)]">Terminá una cosa antes de abrir otra</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--t-text-secondary)]">{WORK_KIND_META[order.workKind].ayuda}</p>
      <div className="mt-5 space-y-3">
        <Info label="Estado" value={WORK_STATUS_META[order.workStatus].label} />
        <Info label="Avance" value={`${Math.round(order.progress * 100)} %`} />
        <Info label="Vence" value={fecha(order.dueDate) ?? 'Sin fecha'} />
        <Info label="Entrega" value={order.deliveryUrl ? 'Link cargado' : 'Todavía sin link'} />
      </div>
      {order.blockedReason && <div className="mt-5 rounded-xl border border-orange-500/25 bg-orange-500/10 p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">Falta del cliente</p><p className="mt-1 text-sm text-[var(--t-text)]">{order.blockedReason}</p></div>}
    </aside>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border)] pb-2 text-sm"><span className="text-[var(--t-muted)]">{label}</span><span className="text-right font-bold text-[var(--t-text)]">{value}</span></div>;
}

function CreateOrder({ targets, members, onClose, onCreated }: { targets: ProductionOsPayload['targets']; members: ProductionOsPayload['members']; onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState('');
  const [workKind, setWorkKind] = useState<WorkKind>('demo_sitio_aapp');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (title.trim().length < 2) return;
    setBusy(true);
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, workKind, notes: notes || undefined, dueDate: dueDate ? `${dueDate}T12:00:00.000Z` : null, projectId: projectId ? Number(projectId) : null, assigneeId: assigneeId ? Number(assigneeId) : null }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
      toast.success('Pedido creado en Producción OS.');
      onCreated(Number(body.task?.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el pedido.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={C.overlay} role="dialog" aria-modal="true" aria-labelledby="production-create-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Nuevo trabajo</p><h2 id="production-create-title" className="mt-1 text-xl font-black">Crear pedido de producción</h2><p className="mt-1 text-sm text-muted-foreground">Nace en Pedido, con un checklist según el tipo. Producción lo acepta cuando realmente lo toma.</p></div><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar"><X className="size-4" /></Button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-bold">Título</span><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej.: Demo tienda para Sur Bohemio" autoFocus /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Tipo de trabajo</span><select value={workKind} onChange={(event) => setWorkKind(event.target.value as WorkKind)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">{Object.entries(WORK_KIND_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Responsable</span><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Sin asignar</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Proyecto</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Automático según el tipo</option>{targets.map((target) => <option key={target.projectId} value={target.projectId}>{target.workspaceName} · {target.projectName}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Fecha objetivo</span><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-bold">Contexto</span><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} placeholder="Qué pidió, alcance acordado, datos que ya tenemos y qué no hay que inventar." /></label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="button" disabled={busy || title.trim().length < 2} className="gap-2" onClick={() => void submit()}>{busy && <Loader2 className="size-4 animate-spin" />}Crear pedido</Button></div>
      </div>
    </div>
  );
}

function StateCard({ icon: Icon, title, detail, children }: { icon: typeof Factory; title: string; detail: string; children?: React.ReactNode }) {
  return <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon className="size-6" /></span><h2 className="mt-4 text-lg font-black">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>{children && <div className="mt-4">{children}</div>}</div>;
}
