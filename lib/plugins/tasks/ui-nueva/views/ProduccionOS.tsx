'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  CircleDashed,
  ClipboardCopy,
  ExternalLink,
  Factory,
  Globe2,
  Loader2,
  PackageCheck,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
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
  puedeTransicionar,
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

/**
 * Qué va a pasar si se aprieta el botón, dicho en la etiqueta.
 *
 * "Aceptado" describe un estado; "Aceptar el pedido" describe la acción. La
 * diferencia importa poco para quien ya conoce el circuito y muchísimo para una
 * IA con navegador, que sólo tiene el texto para decidir dónde hacer clic.
 */
const ACCION_LABEL: Record<WorkStatus, string> = {
  pedido: 'Reabrir como pedido',
  aceptado: 'Aceptar el pedido',
  en_curso: 'Empezar a trabajarlo',
  espera_cliente: 'Marcar: esperando al cliente',
  entregado: 'Entregar con el enlace',
  cambios: 'Registrar cambios del cliente',
  descartado: 'Descartar el pedido',
};

const ACCION_ICON: Partial<Record<WorkStatus, typeof Check>> = {
  en_curso: Play,
  entregado: Check,
  descartado: Trash2,
};

function fecha(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
}

function isOpen(order: ProductionOrder) {
  return WORK_STATUS_META[order.workStatus].abierto;
}

function clienteDe(order: ProductionOrder) {
  return order.parties[0]?.name ?? null;
}

function estaVencido(order: ProductionOrder) {
  if (!order.dueDate || !isOpen(order)) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return new Date(order.dueDate) < hoy;
}

export function ProduccionOS({ onOpenTask, embedded = false, focusRequest = 0 }: { onOpenTask?: (taskId: number) => void; embedded?: boolean; focusRequest?: number }) {
  const { data, error, isLoading, mutate } = useSWR<ProductionOsPayload>(API, fetcher, { refreshInterval: 30_000, revalidateOnFocus: false });
  const [family, setFamily] = useState<FamilyFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [kind, setKind] = useState<'all' | WorkKind>('all');
  const [assignee, setAssignee] = useState<'all' | 'sin' | string>('all');
  const [cliente, setCliente] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [handledFocusRequest, setHandledFocusRequest] = useState(0);

  const clientes = useMemo(() => {
    const nombres = new Set<string>();
    for (const order of data?.orders ?? []) for (const party of order.parties) nombres.add(party.name);
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  }, [data?.orders]);

  const filtrando = family !== 'all' || status !== 'open' || kind !== 'all' || assignee !== 'all' || cliente !== 'all' || query.trim() !== '';
  const limpiar = () => { setFamily('all'); setStatus('open'); setKind('all'); setAssignee('all'); setCliente('all'); setQuery(''); };

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    const lista = (data?.orders ?? []).filter((order) => {
      if (family !== 'all' && order.family !== family) return false;
      if (status === 'open' && !isOpen(order)) return false;
      if (status !== 'all' && status !== 'open' && order.workStatus !== status) return false;
      if (kind !== 'all' && order.workKind !== kind) return false;
      if (assignee === 'sin' && order.assigneeId) return false;
      if (assignee !== 'all' && assignee !== 'sin' && String(order.assigneeId ?? '') !== assignee) return false;
      if (cliente !== 'all' && !order.parties.some((party) => party.name === cliente)) return false;
      if (!needle) return true;
      return [order.title, order.projectName, order.workspaceName ?? '', order.notes, ...order.parties.map((party) => party.name)]
        .some((value) => value.toLocaleLowerCase('es').includes(needle));
    });
    // Lo que nadie tomó va primero y siempre: es el único estado donde la
    // demora no la produce nadie: el pedido está esperando un dueño.
    return lista.sort((a, b) => Number(b.workStatus === 'pedido') - Number(a.workStatus === 'pedido'));
  }, [assignee, cliente, data?.orders, family, kind, query, status]);

  const sinTomar = filtered.filter((order) => order.workStatus === 'pedido').length;

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
        <Button type="button" variant="outline" size="sm" onClick={refresh} data-testid="produccion-accion-reintentar">Reintentar</Button>
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
    <div
      data-testid="produccion-os"
      className={cn(
        'mx-auto min-h-full max-w-[1600px]',
        embedded
          ? 'px-0 py-1 pb-8 [--tareas-accent:var(--primary)] [--t-bg:var(--background)] [--t-surface:var(--card)] [--t-surface-2:var(--muted)] [--t-text:var(--foreground)] [--t-text-secondary:var(--muted-foreground)] [--t-muted:var(--muted-foreground)] [--t-border:var(--border)] [--t-border-2:var(--border)] [--t-hover:var(--muted)] [--t-chip:var(--muted)]'
          : 'px-3 py-4 pb-28 sm:px-5 lg:px-6 lg:py-6',
      )}
    >
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-primary">
            <Factory className="size-3.5" aria-hidden /> Producción OS
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--t-text)] sm:text-3xl">Del pedido a la entrega, sin perder el contexto</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--t-text-secondary)]">Demos, trabajos vendidos y cambios viven en las mismas tareas. La cola dice qué sigue; el Focus concentra un trabajo por vez.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Button type="button" variant="outline" className="gap-2 rounded-xl" data-testid="produccion-accion-abrir-focus" onClick={() => { if (!focusOrders.length) { toast.info('No hay pedidos abiertos para enfocar.'); return; } setFocusOpen(true); }}>
            <Play className="size-4" aria-hidden /> Abrir Focus de producción
          </Button>
          <Button type="button" className="gap-2 rounded-xl" data-testid="produccion-accion-nuevo-pedido" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Nuevo pedido
          </Button>
        </div>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi icon={CircleDashed} label="Trabajo abierto" value={data?.counts.open ?? 0} testId="produccion-contador-abierto" />
        <Kpi icon={UserRound} label="Sin responsable" value={data?.counts.unassigned ?? 0} emphasis={Boolean(data?.counts.unassigned)} testId="produccion-contador-sin-responsable" />
        <Kpi icon={UsersRound} label="Esperando cliente" value={data?.counts.waitingCustomer ?? 0} testId="produccion-contador-espera-cliente" />
        <Kpi icon={CalendarClock} label="Vencidos" value={data?.counts.due ?? 0} emphasis={Boolean(data?.counts.due)} testId="produccion-contador-vencidos" />
      </div>

      {/* Contadores por estado: además de informar, son el filtro. De un
          vistazo se ve dónde se está juntando el trabajo y con un clic se abre
          ese montón. */}
      <div className="mb-4 flex flex-wrap gap-1.5" data-testid="produccion-contadores-estado">
        {WORK_STATUS_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`produccion-contador-${value}`}
            title={WORK_STATUS_META[value].ayuda}
            onClick={() => setStatus(status === value ? 'open' : value)}
            className={cn(C.chip, 'rounded-full', STATUS_TONE[value], status === value && 'ring-2 ring-primary/40')}
          >
            {WORK_STATUS_META[value].label} <span className="tabular-nums font-black">{data?.counts.byStatus[value] ?? 0}</span>
          </button>
        ))}
      </div>

      <section className={cn(C.card, 'overflow-hidden rounded-2xl')}>
        <div className="border-b border-[var(--t-border)] p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="produccion-filtro-familia">
              {(['all', 'demo', 'produccion', 'cambio'] as FamilyFilter[]).map((value) => {
                const Icon = value === 'all' ? Factory : FAMILY_ICON[value];
                const label = value === 'all' ? 'Todo' : FAMILIA_LABEL[value];
                const count = value === 'all' ? data?.orders.length ?? 0 : data?.counts.byFamily[value] ?? 0;
                return (
                  <button
                    key={value}
                    type="button"
                    data-testid={`produccion-filtro-familia-${value}`}
                    aria-pressed={family === value}
                    onClick={() => setFamily(value)}
                    className={cn(C.chip, family === value && 'border-primary/40 bg-primary/10 text-primary')}
                  >
                    <Icon className="size-3.5" aria-hidden /> {label} <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Estado</span>
                <select data-testid="produccion-filtro-estado" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-10 w-full rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 text-sm font-semibold text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="open">Abiertos (sin entregar ni descartar)</option>
                  <option value="all">Todos los estados</option>
                  {WORK_STATUS_ORDER.map((value) => <option key={value} value={value}>{WORK_STATUS_META[value].label}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Tipo de trabajo</span>
                <select data-testid="produccion-filtro-tipo" value={kind} onChange={(event) => setKind(event.target.value as 'all' | WorkKind)} className="h-10 w-full rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 text-sm font-semibold text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">Todos los tipos</option>
                  {Object.entries(WORK_KIND_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Responsable</span>
                <select data-testid="produccion-filtro-responsable" value={assignee} onChange={(event) => setAssignee(event.target.value)} className="h-10 w-full rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 text-sm font-semibold text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">Cualquier responsable</option>
                  <option value="sin">Sin responsable</option>
                  {(data?.members ?? []).map((member) => <option key={member.id} value={String(member.id)}>{member.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Cliente</span>
                <select data-testid="produccion-filtro-cliente" value={cliente} onChange={(event) => setCliente(event.target.value)} className="h-10 w-full rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] px-3 text-sm font-semibold text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">Cualquier cliente</option>
                  {clientes.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
                </select>
              </label>
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Buscar</span>
                <div className="flex gap-2">
                  <label className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--t-muted)]" aria-hidden />
                    <input data-testid="produccion-filtro-busqueda" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, proyecto o cliente…" className="h-10 w-full rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] pl-9 pr-3 text-sm text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30" />
                  </label>
                  <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 rounded-xl" data-testid="produccion-filtro-limpiar" disabled={!filtrando} onClick={limpiar}>Limpiar filtros</Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {isLoading && !data ? (
          <div className="flex min-h-[420px] items-center justify-center gap-2 text-sm text-[var(--t-muted)]"><Loader2 className="size-4 animate-spin" /> Cargando producción…</div>
        ) : filtered.length === 0 ? (
          <StateCard icon={PackageCheck} title="No hay pedidos en este recorte" detail="Cambiá el estado o el tipo, limpiá los filtros o creá un pedido nuevo.">
            <Button type="button" variant="outline" size="sm" data-testid="produccion-filtro-limpiar-vacio" onClick={limpiar}>Limpiar filtros</Button>
          </StateCard>
        ) : (
          <div className="grid min-h-[620px] xl:grid-cols-[minmax(420px,1.15fr)_minmax(420px,1fr)]">
            <Queue orders={filtered} sinTomar={sinTomar} selectedId={selectedId} onSelect={setSelectedId} />
            {selected && <ProductionOrderWorkspace order={selected} members={data?.members ?? []} onChanged={refresh} onOpenTask={onOpenTask} />}
          </div>
        )}
      </section>

      {creating && data && <CreateOrder targets={data.targets} members={data.members} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setStatus('open'); setSelectedId(id); refresh(); }} />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, emphasis, testId }: { icon: typeof Factory; label: string; value: number; emphasis?: boolean; testId: string }) {
  return (
    <div data-testid={testId} data-valor={value} className={cn('rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-3 sm:p-4', emphasis && 'border-amber-500/30')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">{label}</p>
        <Icon className={cn('size-4 text-[var(--t-muted)]', emphasis && 'text-amber-600')} aria-hidden />
      </div>
      <p className="mt-1 text-2xl font-black tabular-nums text-[var(--t-text)]">{value}</p>
    </div>
  );
}

function Queue({ orders, sinTomar, selectedId, onSelect }: { orders: ProductionOrder[]; sinTomar: number; selectedId: number | null; onSelect: (id: number) => void }) {
  return (
    <aside className="max-h-[720px] overflow-y-auto border-b border-[var(--t-border)] bg-[var(--t-surface-2)]/50 p-2 xl:border-b-0 xl:border-r" data-testid="produccion-lista">
      <div className="flex items-center justify-between px-2 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t-muted)]">
        <span>Cola priorizada · {orders.length}</span>
        {sinTomar > 0 && <span className="text-amber-600">{sinTomar} sin tomar</span>}
      </div>
      <div className="space-y-1.5">
        {orders.map((order, index) => (
          <div key={order.id}>
            {/* El corte entre "sin tomar" y el resto se dibuja una sola vez, al
                cambiar el grupo: quien mira la lista no debería tener que leer
                los estados uno por uno para encontrar lo que nadie agarró. */}
            {index > 0 && orders[index - 1].workStatus === 'pedido' && order.workStatus !== 'pedido' && (
              <p className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t-muted)]">Ya tomados</p>
            )}
            {index === 0 && order.workStatus === 'pedido' && (
              <p className="px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Sin tomar · nadie los aceptó todavía</p>
            )}
            <FilaPedido order={order} activo={order.id === selectedId} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </aside>
  );
}

function FilaPedido({ order, activo, onSelect }: { order: ProductionOrder; activo: boolean; onSelect: (id: number) => void }) {
  const Icon = FAMILY_ICON[order.family];
  const vencido = estaVencido(order);
  const cliente = clienteDe(order);
  return (
    <div
      data-testid={`produccion-pedido-${order.id}`}
      data-estado={order.workStatus}
      data-familia={order.family}
      data-tipo={order.workKind}
      role="button"
      tabIndex={0}
      aria-pressed={activo}
      onClick={() => onSelect(order.id)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(order.id); } }}
      className={cn(
        'w-full cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        activo ? 'border-primary/40 bg-primary/10' : 'border-transparent hover:border-[var(--t-border)] hover:bg-[var(--t-surface)]',
        order.workStatus === 'pedido' && !activo && 'border-l-4 border-l-amber-500/70',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border', STATUS_TONE[order.workStatus])}><Icon className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-bold leading-snug text-[var(--t-text)]">{order.title}</p>
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold', STATUS_TONE[order.workStatus])}>{WORK_STATUS_META[order.workStatus].label}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--t-muted)]">
            <span className="font-semibold text-[var(--t-text-secondary)]">{WORK_KIND_META[order.workKind].corto}</span>
            <span>·</span>
            <span className="truncate">{cliente ?? 'Sin cliente vinculado'}</span>
            <span>·</span>
            <span className={cn(!order.assigneeName && 'font-semibold text-amber-600')}>{order.assigneeName ?? 'Sin responsable'}</span>
            <span>·</span>
            <span className={cn(vencido && 'font-bold text-destructive')}>{order.dueDate ? `Vence ${fecha(order.dueDate)}` : 'Sin fecha'}</span>
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[11px] font-bold tabular-nums text-[var(--t-text-secondary)]" data-testid={`produccion-progreso-${order.id}`}>
              {order.checklist.length ? `${order.checklistDone} de ${order.checklist.length}` : 'Sin checklist'}
            </span>
            <span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-[var(--t-hover)]"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(order.progress * 100)}%` }} /></span>
            {order.deliveryUrl && (
              <a
                href={order.deliveryUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                data-testid={`produccion-entrega-${order.id}`}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-primary hover:underline"
              >
                Ver entrega <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
          {order.blockedReason && <p className="mt-1 line-clamp-1 text-[11px] text-orange-700 dark:text-orange-300">Falta del cliente: {order.blockedReason}</p>}
        </div>
      </div>
    </div>
  );
}

export function ProductionOrderWorkspace({ order, members, onChanged, onOpenTask, focusMode = false }: { order: ProductionOrder; members: ProductionOsPayload['members']; onChanged: () => void; onOpenTask?: (id: number) => void; focusMode?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [blockedReason, setBlockedReason] = useState(order.blockedReason ?? '');
  const [deliveryUrl, setDeliveryUrl] = useState(order.deliveryUrl ?? '');
  const [prompt, setPrompt] = useState(order.aiPrompt ?? '');
  useEffect(() => {
    setBlockedReason(order.blockedReason ?? '');
    setDeliveryUrl(order.deliveryUrl ?? '');
    setPrompt(order.aiPrompt ?? '');
  }, [order.id, order.blockedReason, order.deliveryUrl, order.aiPrompt]);

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
    // El servidor rechaza las dos cosas igual; acá se avisa antes para no
    // gastar un viaje y para que el motivo quede a la vista.
    if (next === 'espera_cliente' && !blockedReason.trim()) {
      toast.error('Escribí qué falta del cliente.');
      return;
    }
    if (next === 'entregado' && !deliveryUrl.trim()) {
      toast.error('Pegá el enlace de entrega.');
      return;
    }
    void patch({ workStatus: next, ...(next === 'espera_cliente' ? { blockedReason } : {}), ...(next === 'entregado' ? { deliveryUrl } : {}) }, `${ACCION_LABEL[next]}: hecho.`);
  };

  const transiciones = WORK_STATUS_TRANSITIONS[order.workStatus].filter((next) => puedeTransicionar(order.workStatus, next));
  const pideMotivo = transiciones.includes('espera_cliente');
  const pideEnlace = transiciones.includes('entregado');

  return (
    <article className="min-w-0 border-b border-[var(--t-border)] bg-[var(--t-surface)] p-4 sm:p-5" data-testid="produccion-detalle" data-pedido={order.id}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold', STATUS_TONE[order.workStatus])}>{WORK_STATUS_META[order.workStatus].label}</span>
            <span className="text-xs font-semibold text-[var(--t-muted)]">{WORK_KIND_META[order.workKind].corto}</span>
            {order.dueDate && <span className={cn('text-xs font-semibold', estaVencido(order) ? 'text-destructive' : 'text-[var(--t-muted)]')}>Vence {fecha(order.dueDate)}</span>}
          </div>
          <h2 className="mt-3 text-xl font-black leading-tight text-[var(--t-text)] sm:text-2xl">{order.title}</h2>
          <p className="mt-1 text-xs text-[var(--t-muted)]">{order.workspaceName} · {order.projectName} · {clienteDe(order) ?? 'Sin cliente vinculado'}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {onOpenTask && <Button type="button" variant="outline" size="sm" className="gap-1.5" data-testid="produccion-accion-abrir-tarea" onClick={() => onOpenTask(order.id)}>Abrir tarea <ExternalLink className="size-3.5" /></Button>}
          <a href={`/plugins/tasks?proyecto=${order.projectId}`} data-testid="produccion-accion-abrir-tablero" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">Tablero <ExternalLink className="size-3.5" /></a>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">Responsable</span>
          <select data-testid="produccion-campo-responsable" value={order.assigneeId ?? ''} disabled={busy} onChange={(event) => void patch({ assigneeId: event.target.value ? Number(event.target.value) : null }, 'Responsable actualizado.')} className={cn(C.control, 'border border-[var(--t-border)]')}>
            <option value="">Sin asignar</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <div className="space-y-1.5"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">Pedido por</span><div className={cn(C.control, 'border border-[var(--t-border)]')}>{order.requestedByName ?? 'Sin registro'}</div></div>
      </div>

      {order.parties.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{order.parties.map((party) => party.chatId ? <a key={`${party.type}-${party.id}`} href={`/dashboard/chat/${party.chatId}`} className={C.chip}><UserRound className="size-3.5" /> {party.name} <ExternalLink className="size-3" /></a> : <span key={`${party.type}-${party.id}`} className={C.chip}><UserRound className="size-3.5" /> {party.name}</span>)}</div>}

      <section className="mt-5 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4" data-testid="produccion-checklist">
        <div className="flex items-center justify-between"><h3 className="text-sm font-black text-[var(--t-text)]">Qué falta para entregar</h3><span className="text-xs font-bold tabular-nums text-[var(--t-muted)]">{order.checklistDone} de {order.checklist.length}</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--t-hover)]"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(order.progress * 100)}%` }} /></div>
        <div className="mt-3 space-y-1">
          {order.checklist.length ? order.checklist.map((item, index) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-xl px-2 py-2 hover:bg-[var(--t-hover)]">
              <input
                type="checkbox"
                data-testid={`produccion-checklist-${order.id}-${item.id}`}
                checked={item.completed}
                disabled={busy}
                onChange={() => { const checklist = order.checklist.map((step, i) => i === index ? { ...step, completed: !step.completed } : step); void patch({ checklist }, 'Checklist actualizado.'); }}
                className="mt-0.5 size-4 accent-[var(--tareas-accent)]"
              />
              <span className={cn('text-sm text-[var(--t-text)]', item.completed && 'line-through opacity-55')}>{item.text}</span>
            </label>
          )) : <p className="text-sm text-[var(--t-muted)]">Este pedido histórico no tiene checklist. Abrí la tarea para agregar pasos.</p>}
        </div>
      </section>

      {order.notes && <section className="mt-4"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-muted)]">Contexto</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--t-text-secondary)]">{order.notes}</p></section>}

      <section className="mt-4 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-[var(--t-text)]"><Bot className="mr-2 inline size-4 text-primary" aria-hidden />Prompt para producir</h3>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" data-testid="produccion-accion-copiar-prompt" disabled={!prompt.trim()} onClick={() => { void navigator.clipboard?.writeText(prompt).then(() => toast.success('Prompt copiado.')).catch(() => toast.error('No se pudo copiar.')); }}>
            <ClipboardCopy className="size-3.5" aria-hidden /> Copiar prompt
          </Button>
        </div>
        <Textarea data-testid="produccion-campo-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} maxLength={20000} placeholder="Qué hay que producir, con qué datos y qué no hay que inventar." className="mt-2 rounded-xl" />
        <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5" data-testid="produccion-accion-guardar-prompt" disabled={busy || prompt === order.aiPrompt} onClick={() => void patch({ aiPrompt: prompt }, 'Prompt guardado.')}>
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />} Guardar prompt
        </Button>
      </section>

      <section className="mt-5 space-y-3 border-t border-[var(--t-border)] pt-5">
        <div><h3 className="text-sm font-black text-[var(--t-text)]">Siguiente movimiento</h3><p className="text-xs text-[var(--t-muted)]">{WORK_STATUS_META[order.workStatus].ayuda}</p></div>
        {pideMotivo && (
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Qué falta del cliente</span>
            <Textarea data-testid="produccion-campo-blocked_reason" value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} rows={2} placeholder="Logo, textos, accesos, seña…" className="rounded-xl" />
          </label>
        )}
        {pideEnlace && (
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Enlace de la entrega</span>
            <Input data-testid="produccion-campo-delivery_url" value={deliveryUrl} onChange={(event) => setDeliveryUrl(event.target.value)} type="url" placeholder="https://… enlace de la entrega" className="rounded-xl" />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {transiciones.map((next, index) => {
            const faltaMotivo = next === 'espera_cliente' && !blockedReason.trim();
            const faltaEnlace = next === 'entregado' && !deliveryUrl.trim();
            const Icon = ACCION_ICON[next];
            return (
              <Button
                key={next}
                type="button"
                data-testid={`produccion-accion-${next}`}
                disabled={busy || faltaMotivo || faltaEnlace}
                title={faltaEnlace ? 'Pegá el enlace de la entrega para poder entregar' : faltaMotivo ? 'Escribí qué falta del cliente' : WORK_STATUS_META[next].ayuda}
                variant={index === 0 ? 'default' : next === 'descartado' ? 'ghost' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => transition(next)}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : Icon ? <Icon className="size-3.5" /> : null}
                {ACCION_LABEL[next]}
              </Button>
            );
          })}
        </div>
        {pideEnlace && !deliveryUrl.trim() && <p className="text-xs font-semibold text-[var(--t-muted)]" data-testid="produccion-aviso-delivery_url">Para entregar hace falta el enlace: pegalo arriba y el botón se habilita.</p>}
        {pideMotivo && !blockedReason.trim() && <p className="text-xs font-semibold text-[var(--t-muted)]" data-testid="produccion-aviso-blocked_reason">Para dejarlo esperando al cliente hay que decir qué falta.</p>}
      </section>

      <EstadoJson order={order} />
      {!focusMode && <NextPanel order={order} className="mt-5" />}
    </article>
  );
}

/**
 * El pedido tal cual lo devuelve la API, plegado.
 *
 * Está para las pasadas automáticas: una IA que lee la pantalla no tiene que
 * deducir el estado de un chip de color ni adivinar el id de la tarea. Cerrado
 * por defecto porque a una persona no le aporta nada.
 */
export function EstadoJson({ order }: { order: ProductionOrder }) {
  const json = JSON.stringify(order, null, 2);
  return (
    <details className="mt-5 rounded-xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-3" data-testid="produccion-estado-json" data-pedido={order.id}>
      <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-[var(--t-muted)]">Estado en JSON</summary>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" data-testid="produccion-accion-copiar-json" onClick={() => { void navigator.clipboard?.writeText(json).then(() => toast.success('Estado copiado.')).catch(() => toast.error('No se pudo copiar.')); }}>
          <ClipboardCopy className="size-3.5" aria-hidden /> Copiar JSON
        </Button>
      </div>
      <pre data-testid="produccion-estado-json-contenido" className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-[var(--t-text-secondary)]">{json}</pre>
    </details>
  );
}

function NextPanel({ order, className }: { order: ProductionOrder; className?: string }) {
  return (
    <aside className={cn('rounded-2xl bg-[var(--t-surface-2)]/60 p-5', className)}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t-muted)]">Focus</p>
      <h3 className="mt-2 text-lg font-black text-[var(--t-text)]">Terminá una cosa antes de abrir otra</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--t-text-secondary)]">{WORK_KIND_META[order.workKind].ayuda}</p>
      <div className="mt-5 space-y-3">
        <Info label="Estado" value={WORK_STATUS_META[order.workStatus].label} />
        <Info label="Avance" value={order.checklist.length ? `${order.checklistDone} de ${order.checklist.length}` : `${Math.round(order.progress * 100)} %`} />
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
    <div className={C.overlay} role="dialog" aria-modal="true" aria-labelledby="production-create-title" data-testid="produccion-dialogo-nuevo" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Nuevo trabajo</p><h2 id="production-create-title" className="mt-1 text-xl font-black">Crear pedido de producción</h2><p className="mt-1 text-sm text-muted-foreground">Nace en Pedido, con un checklist según el tipo. Producción lo acepta cuando realmente lo toma.</p></div><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar" data-testid="produccion-accion-cerrar-nuevo"><X className="size-4" /></Button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-bold">Título</span><Input data-testid="produccion-campo-titulo" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej.: Demo tienda para Sur Bohemio" autoFocus /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Tipo de trabajo</span><select data-testid="produccion-campo-tipo" value={workKind} onChange={(event) => setWorkKind(event.target.value as WorkKind)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">{Object.entries(WORK_KIND_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Responsable</span><select data-testid="produccion-campo-nuevo-responsable" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Sin asignar</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Proyecto</span><select data-testid="produccion-campo-proyecto" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Automático según el tipo</option>{targets.map((target) => <option key={target.projectId} value={target.projectId}>{target.workspaceName} · {target.projectName}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold">Fecha objetivo</span><Input data-testid="produccion-campo-vencimiento" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-bold">Contexto</span><Textarea data-testid="produccion-campo-contexto" value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} placeholder="Qué pidió, alcance acordado, datos que ya tenemos y qué no hay que inventar." /></label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="button" data-testid="produccion-accion-crear-pedido" disabled={busy || title.trim().length < 2} className="gap-2" onClick={() => void submit()}>{busy && <Loader2 className="size-4 animate-spin" />}Crear pedido</Button></div>
      </div>
    </div>
  );
}

function StateCard({ icon: Icon, title, detail, children }: { icon: typeof Factory; title: string; detail: string; children?: React.ReactNode }) {
  return <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon className="size-6" /></span><h2 className="mt-4 text-lg font-black">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>{children && <div className="mt-4">{children}</div>}</div>;
}
