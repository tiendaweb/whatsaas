'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Cable,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Coffee,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  Loader2,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Save,
  Sparkles,
  Timer,
  Trash2,
  UserRound,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { DetailPayload } from '@/lib/plugins/sales-ops/shared/api-types';
import { fetcher, SALES_OPS_API } from '@/lib/plugins/sales-ops/ui/components/format';
import { PanelContacto, type SolapaContacto } from '@/lib/plugins/sales-ops/ui/focus/PanelContacto';
import type { ProductionOrder, ProductionOsPayload } from '@/lib/plugins/tasks/server/production-os';
import {
  FAMILIA_LABEL,
  WORK_KIND_META,
  WORK_STATUS_META,
  WORK_STATUS_TRANSITIONS,
  cadenaDeTrabajo,
  puedeTransicionar,
  type Familia,
  type WorkStatus,
} from '@/lib/plugins/tasks/shared/produccion';
import { relojBloque, useBloqueProduccion, type BloqueProduccion } from '../hooks/useBloqueProduccion';

type FocusScope = 'all' | Familia;
type ContextTab = 'chat' | 'audios' | 'archivos' | 'links' | 'crm';
type Header = { chatId: number; contactId: number | null; name: string; remoteJid: string; instanceId: number | null };
type Detail = DetailPayload & { header: Header };
type MediaItem = { id: string; mediaUrl?: string | null; mediaSeconds?: number | null; mediaCaption?: string | null; text?: string | null; timestamp: string; fromMe: boolean; fileName?: string | null };
type LinkItem = { id: string; kind: 'url' | 'email'; value: string; timestamp: string; fromMe: boolean; messageText?: string | null };
type CustomerPayload = { attachments?: Array<{ id: number; url: string; fileName: string }> };

const CONTEXT_TABS: Array<{ id: ContextTab; label: string; icon: typeof Timer }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'audios', label: 'Audios', icon: Mic },
  { id: 'archivos', label: 'Archivos', icon: FileText },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'crm', label: 'CRM', icon: UserRound },
];

/**
 * En qué orden se vacían las familias.
 *
 * Primero demos, que son de pre-venta y se hacen rápido y en volumen; después
 * los cambios, que son cortos y tienen a un cliente esperando; al final la
 * producción, que es lo que pide una sesión larga. Es el orden que evita
 * arrancar el bloque con lo más pesado.
 */
const ORDEN_FAMILIAS: Familia[] = ['demo', 'cambio', 'produccion'];
const FAMILY_ICON = { demo: Globe2, produccion: UsersRound, cambio: Wrench } as const;

/**
 * Los textos de los botones dicen qué va a pasar, no cómo se llama el estado.
 * Está duplicado a propósito con `ProduccionOS.tsx`: esa vista importa a esta,
 * y hacerlo al revés armaría un ciclo entre los dos módulos.
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

const optionalFetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 403 || response.status === 404) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
  return body;
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function fechaCorta(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
}

function clienteDe(order: ProductionOrder) {
  return order.parties[0]?.name ?? null;
}

export function ProductionFocusView({ orders, initialOrderId, members, onClose, onChanged }: {
  orders: ProductionOrder[];
  initialOrderId: number;
  members: ProductionOsPayload['members'];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [scope, setScope] = useState<FocusScope>('all');
  const scoped = useMemo(() => orders.filter((order) => scope === 'all' || order.family === scope), [orders, scope]);
  const [selectedId, setSelectedId] = useState(initialOrderId);
  const selectedIndex = Math.max(0, scoped.findIndex((order) => order.id === selectedId));
  const order = scoped[selectedIndex] ?? null;
  const [tab, setTab] = useState<ContextTab>('chat');
  const [chatId, setChatId] = useState<number | null>(order?.parties.find((party) => party.chatId)?.chatId ?? null);
  const bloque = useBloqueProduccion();

  // La tanda es la foto de la cola al entrar: si se recalculara sobre `orders`,
  // la barra nunca avanzaría (cada pedido resuelto desaparece de la lista y el
  // denominador bajaría con el numerador).
  const cargados = useRef<number[]>(orders.map((item) => item.id));
  const resueltos = cargados.current.filter((id) => !orders.some((item) => item.id === id)).length;
  const totalTanda = cargados.current.length;
  const [festejo, setFestejo] = useState(false);

  useEffect(() => {
    if (!bloque.hayBloque) bloque.arrancar('foco');
    // Sólo se arranca al entrar; el hook conserva el bloque si la página recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!order) return;
    setChatId(order.parties.find((party) => party.chatId)?.chatId ?? null);
  }, [order?.id]);

  useEffect(() => {
    if (!scoped.some((candidate) => candidate.id === selectedId) && scoped[0]) setSelectedId(scoped[0].id);
  }, [scoped, selectedId]);

  useEffect(() => {
    const oldTitle = document.title;
    const oldOverflow = document.body.style.overflow;
    document.title = 'Focus de Producción — Command Center';
    document.body.style.overflow = 'hidden';
    return () => { document.title = oldTitle; document.body.style.overflow = oldOverflow; };
  }, []);

  // Vaciar una familia es el único hito real del bloque: se festeja una vez y
  // se ofrece la siguiente, en vez de dejar la pantalla vacía sin salida.
  const familiaVacia = scope !== 'all' && scoped.length === 0;
  const siguienteFamilia = useMemo(() => {
    const desde = scope === 'all' ? -1 : ORDEN_FAMILIAS.indexOf(scope);
    for (let salto = 1; salto <= ORDEN_FAMILIAS.length; salto += 1) {
      const candidata = ORDEN_FAMILIAS[(desde + salto + ORDEN_FAMILIAS.length) % ORDEN_FAMILIAS.length];
      if (candidata !== scope && orders.some((item) => item.family === candidata)) return candidata;
    }
    return null;
  }, [orders, scope]);

  useEffect(() => {
    if (!familiaVacia) return;
    setFestejo(true);
    // El canvas se apaga solo cuando termina la animación: si quedara activo,
    // seguiría montado encima de la pantalla sin dibujar nada.
    const id = window.setTimeout(() => setFestejo(false), 3200);
    return () => window.clearTimeout(id);
  }, [familiaVacia]);

  const move = (delta: number) => {
    const next = scoped[selectedIndex + delta];
    if (next) setSelectedId(next.id);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Con el foco en un campo las flechas mueven el cursor: ahí no se navega.
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div data-testid="produccion-focus" className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-background text-foreground [--tareas-accent:var(--primary)] [--t-bg:var(--background)] [--t-surface:var(--card)] [--t-surface-2:var(--muted)] [--t-text:var(--foreground)] [--t-text-secondary:var(--muted-foreground)] [--t-muted:var(--muted-foreground)] [--t-border:var(--border)] [--t-hover:var(--muted)]">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-2 py-1.5 sm:px-3">
        <Button variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 text-muted-foreground" data-testid="produccion-focus-salir" onClick={onClose}>
          <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Volver a Producción</span>
        </Button>
        <TimerButton bloque={bloque} />
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-black">{order?.title ?? 'Sin pedidos en este recorte'}</p>
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{order ? `${WORK_KIND_META[order.workKind].corto} · ${clienteDe(order) ?? 'Sin cliente'} · ${WORK_STATUS_META[order.workStatus].label}` : 'Cambiá el filtro para continuar'}</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Familia de trabajo" data-testid="produccion-filtro-familia">
          {(['all', ...ORDEN_FAMILIAS] as FocusScope[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              data-testid={`produccion-filtro-familia-${id}`}
              onClick={() => setScope(id)}
              className={cn('min-h-8 rounded-md px-2 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', scope === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
            >
              {id === 'all' ? 'Todo' : FAMILIA_LABEL[id]} <span className="tabular-nums opacity-70">{id === 'all' ? orders.length : orders.filter((item) => item.family === id).length}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="size-8" data-testid="produccion-focus-anterior" disabled={selectedIndex <= 0} onClick={() => move(-1)} aria-label="Pedido anterior"><ChevronLeft className="size-4" /></Button>
          <span className="min-w-12 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{order ? selectedIndex + 1 : 0}/{scoped.length}</span>
          <Button variant="ghost" size="icon" className="size-8" data-testid="produccion-focus-siguiente" disabled={selectedIndex >= scoped.length - 1} onClick={() => move(1)} aria-label="Pedido siguiente"><ChevronRight className="size-4" /></Button>
        </div>
      </header>

      <ProgresoTanda resueltos={resueltos} total={totalTanda} />

      {!order ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center" data-testid="produccion-focus-vacio">
          <p className="text-sm font-bold">{scope === 'all' ? 'No queda ningún pedido abierto en la tanda.' : `Terminaste ${FAMILIA_LABEL[scope].toLocaleLowerCase('es')}.`}</p>
          <p className="max-w-md text-xs text-muted-foreground">{resueltos > 0 ? `Resolviste ${resueltos} de ${totalTanda} pedidos de esta tanda.` : 'Cambiá de familia o volvé a la cola general.'}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {siguienteFamilia && (
              <Button type="button" className="gap-1.5" data-testid={`produccion-focus-siguiente-familia-${siguienteFamilia}`} onClick={() => { setFestejo(false); setScope(siguienteFamilia); }}>
                Pasar a {FAMILIA_LABEL[siguienteFamilia]} <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
            {scope !== 'all' && <Button type="button" variant="outline" data-testid="produccion-focus-ver-todas" onClick={() => setScope('all')}>Ver todas las familias</Button>}
            <Button type="button" variant="ghost" onClick={onClose}>Volver a Producción</Button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[260px_minmax(480px,1fr)_440px] xl:overflow-hidden">
          <ProjectQueue orders={scoped} selectedId={order.id} onSelect={setSelectedId} />
          <main className="min-w-0 xl:overflow-y-auto">
            <ProjectWorkPanel order={order} members={members} onChanged={onChanged} onAdvance={() => move(1)} />
          </main>
          <ContextPanel order={order} tab={tab} onTab={setTab} chatId={chatId} onChatId={setChatId} />
        </div>
      )}

      <Confeti activo={festejo} />
      <BlockFinished bloque={bloque} onClose={onClose} />
    </div>
  );
}

function ProgresoTanda({ resueltos, total }: { resueltos: number; total: number }) {
  const porcentaje = total ? Math.round((resueltos / total) * 100) : 0;
  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-1.5" data-testid="produccion-focus-progreso" data-resueltos={resueltos} data-total={total}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{resueltos} de {total} resueltos en esta tanda</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${porcentaje}%` }} /></span>
        <span className="text-[11px] font-black tabular-nums text-muted-foreground">{porcentaje} %</span>
      </div>
    </div>
  );
}

/** Los segundos que corren, aislados: repintan cinco caracteres y no el Focus. */
function Reloj({ terminaEn, pausadoCon }: { terminaEn: number | null; pausadoCon: number | null }) {
  const calcular = () => (pausadoCon != null ? pausadoCon : terminaEn != null ? Math.max(0, terminaEn - Date.now()) : 0);
  const [restante, setRestante] = useState(calcular);

  useEffect(() => {
    setRestante(calcular());
    // Pausado no hay nada que contar: el número no se mueve hasta que reanuden.
    if (pausadoCon != null || terminaEn == null) return;
    const id = window.setInterval(() => setRestante(Math.max(0, terminaEn - Date.now())), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminaEn, pausadoCon]);

  return <>{relojBloque(restante)}</>;
}

function TimerButton({ bloque }: { bloque: BloqueProduccion }) {
  const action = () => !bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar();
  return (
    <button
      type="button"
      onClick={action}
      data-testid="produccion-focus-bloque"
      data-estado={!bloque.hayBloque ? 'sin-bloque' : bloque.pausado ? 'pausado' : 'corriendo'}
      title={!bloque.hayBloque ? 'Iniciar un bloque de 25 minutos' : bloque.pausado ? 'Reanudar el bloque' : 'Pausar el bloque'}
      className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', bloque.pausado ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-card')}
    >
      {!bloque.hayBloque ? <Timer className="size-4" /> : bloque.pausado ? <Play className="size-4" /> : <Pause className="size-4" />}
      {bloque.hayBloque ? <Reloj terminaEn={bloque.terminaEn} pausadoCon={bloque.pausadoCon} /> : `${String(bloque.minutos).padStart(2, '0')}:00`}
    </button>
  );
}

function ProjectQueue({ orders, selectedId, onSelect }: { orders: ProductionOrder[]; selectedId: number; onSelect: (id: number) => void }) {
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-r border-border bg-muted/30 p-2 xl:block" aria-label="Pedidos de producción" data-testid="produccion-focus-cola">
      <p className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Pedidos para hacer · {orders.length}</p>
      <div className="space-y-1">
        {orders.map((item) => {
          const Icon = FAMILY_ICON[item.family];
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`produccion-pedido-${item.id}`}
              data-estado={item.workStatus}
              data-familia={item.family}
              data-tipo={item.workKind}
              onClick={() => onSelect(item.id)}
              className={cn('w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selectedId === item.id ? 'border-primary/35 bg-primary/10' : 'border-transparent hover:bg-card', item.workStatus === 'pedido' && selectedId !== item.id && 'border-l-4 border-l-amber-500/70')}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Icon className="size-3" aria-hidden />{WORK_KIND_META[item.workKind].corto}</span>
              <span className="mt-1 block line-clamp-2 text-sm font-bold leading-snug">{item.title}</span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{WORK_STATUS_META[item.workStatus].label} · {item.checklist.length ? `${item.checklistDone} de ${item.checklist.length}` : 'Sin checklist'}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{clienteDe(item) ?? 'Sin cliente'} · {item.assigneeName ?? 'Sin responsable'}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ProjectWorkPanel({ order, members, onChanged, onAdvance }: { order: ProductionOrder; members: ProductionOsPayload['members']; onChanged: () => void; onAdvance: () => void }) {
  const [busy, setBusy] = useState(false);
  const [blockedReason, setBlockedReason] = useState(order.blockedReason ?? '');
  const [deliveryUrl, setDeliveryUrl] = useState(order.deliveryUrl ?? '');
  const [prompt, setPrompt] = useState(order.aiPrompt ?? '');
  useEffect(() => {
    setBlockedReason(order.blockedReason ?? '');
    setDeliveryUrl(order.deliveryUrl ?? '');
    setPrompt(order.aiPrompt ?? '');
  }, [order.id, order.blockedReason, order.deliveryUrl, order.aiPrompt]);

  const patch = async (payload: Record<string, unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    try {
      const response = await fetch(`/api/plugins/tasks/production/${order.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
      toast.success(success);
      onChanged();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el pedido.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const executeWithApi = async () => {
    if (prompt.trim().length < 5) return toast.error('Escribí un prompt de al menos 5 caracteres.');
    const saved = await patch({ aiPrompt: prompt }, 'Prompt guardado.');
    if (!saved) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/plugins/tasks/production/${order.id}/execute`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok !== true) throw new Error(String(body?.error ?? `Error ${response.status}`));
      toast.success('Gemini completó el prompt. Pasamos al siguiente pedido.');
      onChanged();
      onAdvance();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gemini no pudo ejecutar el prompt. Seguís en este pedido.');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const leaveForConnector = async () => {
    if (prompt.trim().length < 5) return toast.error('Escribí un prompt de al menos 5 caracteres.');
    const queued = await patch({ aiPrompt: prompt, aiReadyAt: new Date().toISOString() }, 'Trabajo guardado para el próximo conector.');
    if (queued) onAdvance();
  };

  const transition = (next: WorkStatus) => {
    if (next === 'espera_cliente' && !blockedReason.trim()) return toast.error('Escribí qué falta del cliente.');
    if (next === 'entregado' && !deliveryUrl.trim()) return toast.error('Pegá el enlace de entrega.');
    void patch({ workStatus: next, ...(next === 'espera_cliente' ? { blockedReason } : {}), ...(next === 'entregado' ? { deliveryUrl } : {}) }, `${ACCION_LABEL[next]}: hecho.`);
  };

  // Sólo se ofrecen los caminos que el servidor va a aceptar: un botón que
  // siempre falla es peor que no tenerlo, y una IA lo intentaría igual.
  const transiciones = WORK_STATUS_TRANSITIONS[order.workStatus].filter((next) => puedeTransicionar(order.workStatus, next));
  const pideMotivo = transiciones.includes('espera_cliente');
  const pideEnlace = transiciones.includes('entregado');
  const receta = cadenaDeTrabajo(order.workKind, order.id);
  const jsonPedido = JSON.stringify(order, null, 2);

  return (
    <article className="mx-auto max-w-4xl p-4 sm:p-6" data-testid="produccion-focus-pedido" data-pedido={order.id} data-estado={order.workStatus}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{WORK_STATUS_META[order.workStatus].label}</span>
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{WORK_KIND_META[order.workKind].label}</span>
            <span className={cn('text-[11px] font-bold', order.dueDate ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{order.dueDate ? `Vence ${fechaCorta(order.dueDate)}` : 'Sin fecha de entrega'}</span>
          </div>
          <h1 className="mt-3 text-2xl font-black leading-tight">{order.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{clienteDe(order) ?? 'Sin cliente vinculado'} · {order.workspaceName} · {order.projectName}</p>
        </div>
        <a href={`/plugins/tasks?proyecto=${order.projectId}`} data-testid="produccion-accion-abrir-tablero" className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted">Abrir tablero <ExternalLink className="size-3.5" /></a>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Responsable</span>
          <select data-testid="produccion-campo-responsable" value={order.assigneeId ?? ''} disabled={busy} onChange={(event) => void patch({ assigneeId: event.target.value ? Number(event.target.value) : null }, 'Responsable actualizado.')} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Sin asignar</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Avance</p><p className="mt-1 text-xl font-black tabular-nums">{order.checklist.length ? `${order.checklistDone} de ${order.checklist.length}` : `${Math.round(order.progress * 100)} %`}</p></div>
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4" data-testid="produccion-checklist">
        <div className="flex items-center justify-between"><h2 className="text-sm font-black">Qué falta</h2><span className="text-xs font-bold tabular-nums text-muted-foreground">{order.checklistDone} de {order.checklist.length}</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(order.progress * 100)}%` }} /></div>
        <div className="mt-3 space-y-1">
          {order.checklist.length ? order.checklist.map((item, index) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-xl px-2 py-2 hover:bg-muted">
              <input
                type="checkbox"
                data-testid={`produccion-checklist-${order.id}-${item.id}`}
                checked={item.completed}
                disabled={busy}
                onChange={() => void patch({ checklist: order.checklist.map((step, current) => current === index ? { ...step, completed: !step.completed } : step) }, 'Checklist actualizado.')}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className={cn('text-sm', item.completed && 'line-through opacity-55')}>{item.text}</span>
            </label>
          )) : <p className="text-sm text-muted-foreground">Agregá los pasos desde la tarea del tablero.</p>}
        </div>
      </section>

      {order.notes && <section className="mt-5"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Contexto del pedido</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{order.notes}</p></section>}

      <section className="mt-5 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300"><Bot className="size-4" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black">Prompt de producción</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Editalo acá y elegí si lo resuelve el banco Gemini o si queda disponible para un conector con herramientas.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5" data-testid="produccion-accion-copiar-prompt" disabled={!prompt.trim()} onClick={() => { void navigator.clipboard?.writeText(prompt).then(() => toast.success('Prompt copiado.')).catch(() => toast.error('No se pudo copiar.')); }}>
            <ClipboardCopy className="size-3.5" aria-hidden /> Copiar
          </Button>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Prompt de producción</span>
          <textarea data-testid="produccion-campo-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} maxLength={20000} placeholder="Describí el resultado esperado, las fuentes que debe usar y los límites que tiene que respetar." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" data-testid="produccion-accion-guardar-prompt" disabled={busy || prompt === order.aiPrompt} className="gap-1.5" onClick={() => void patch({ aiPrompt: prompt }, 'Prompt guardado.')}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />} Guardar prompt
          </Button>
          <Button type="button" size="sm" data-testid="produccion-accion-ejecutar-prompt" disabled={busy || prompt.trim().length < 5} className="gap-1.5 bg-sky-600 text-white hover:bg-sky-700" onClick={() => void executeWithApi()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} Ejecutar con API Gemini
          </Button>
          <Button type="button" variant="outline" size="sm" data-testid="produccion-accion-dejar-conector" disabled={busy || prompt.trim().length < 5} className="gap-1.5" onClick={() => void leaveForConnector()}>
            <Cable className="size-3.5" aria-hidden /> Dejar para conector
          </Button>
        </div>
        {order.aiReadyAt && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300"><Cable className="size-3.5" aria-hidden /> Disponible en la cola de conectores</p>}
        {order.lastAiRun && (
          <div data-testid="produccion-ultima-corrida" className={cn('mt-3 rounded-xl border p-3', order.lastAiRun.status === 'completed' ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-destructive/25 bg-destructive/10')}>
            <p className="flex items-center gap-1.5 text-xs font-bold">{order.lastAiRun.status === 'completed' ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> : <Bot className="size-3.5 text-destructive" aria-hidden />}{order.lastAiRun.status === 'completed' ? 'Último resultado de Gemini' : 'La última ejecución falló'}</p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-foreground/85">{order.lastAiRun.summary}</p>
          </div>
        )}
      </section>

      {/* La receta del tipo de trabajo: con qué herramientas se hace y en qué
          orden. Está plegada porque quien produce a mano ya la sabe; quien pasa
          con un conector la necesita textual para no elegir mal el producto. */}
      <details className="mt-4 rounded-xl border border-border bg-card p-3" data-testid="produccion-receta">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Cómo se hace este tipo de trabajo</summary>
        <p className="mt-2 text-xs font-semibold text-muted-foreground">Herramientas: {receta.tools.join(', ')}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">{receta.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      </details>

      <section className="mt-5 space-y-3 border-t border-border pt-5">
        <div><h2 className="text-sm font-black">Cerrar el siguiente movimiento</h2><p className="text-xs text-muted-foreground">{WORK_STATUS_META[order.workStatus].ayuda}</p></div>
        {pideMotivo && (
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Qué falta del cliente</span>
            <textarea data-testid="produccion-campo-blocked_reason" value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} rows={2} placeholder="Logo, textos, accesos, seña…" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        )}
        {pideEnlace && (
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Enlace de la entrega</span>
            <input data-testid="produccion-campo-delivery_url" value={deliveryUrl} onChange={(event) => setDeliveryUrl(event.target.value)} type="url" placeholder="https://… enlace de entrega" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
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
        {pideEnlace && !deliveryUrl.trim() && <p className="text-xs font-semibold text-muted-foreground" data-testid="produccion-aviso-delivery_url">Para entregar hace falta el enlace: pegalo arriba y el botón se habilita.</p>}
        {pideMotivo && !blockedReason.trim() && <p className="text-xs font-semibold text-muted-foreground" data-testid="produccion-aviso-blocked_reason">Para dejarlo esperando al cliente hay que decir qué falta.</p>}
      </section>

      {/* El pedido tal cual lo devuelve la API: una IA que lee la pantalla no
          tiene que inferir el estado ni el id de un chip de color. */}
      <details className="mt-5 rounded-xl border border-border bg-card p-3" data-testid="produccion-estado-json" data-pedido={order.id}>
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Estado en JSON</summary>
        <div className="mt-2 flex justify-end">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" data-testid="produccion-accion-copiar-json" onClick={() => { void navigator.clipboard?.writeText(jsonPedido).then(() => toast.success('Estado copiado.')).catch(() => toast.error('No se pudo copiar.')); }}>
            <ClipboardCopy className="size-3.5" aria-hidden /> Copiar JSON
          </Button>
        </div>
        <pre data-testid="produccion-estado-json-contenido" className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-muted-foreground">{jsonPedido}</pre>
      </details>
    </article>
  );
}

function ContextPanel({ order, tab, onTab, chatId, onChatId }: { order: ProductionOrder; tab: ContextTab; onTab: (tab: ContextTab) => void; chatId: number | null; onChatId: (id: number) => void }) {
  const chats = order.parties.filter((party): party is ProductionOrder['parties'][number] & { chatId: number } => Boolean(party.chatId));
  const customerId = order.parties.find((party) => party.type === 'customer')?.id ?? null;
  const { data: detail, error } = useSWR<Detail>(chatId ? `${SALES_OPS_API}/contacts/${chatId}` : null, fetcher, { revalidateOnFocus: false });
  const jid = detail?.header.remoteJid ? encodeURIComponent(detail.header.remoteJid) : null;
  // Se precargan las tres bandejas al elegir el chat: así cambiar de solapa es
  // inmediato y los contadores dicen si vale la pena abrirla.
  const { data: audios, isLoading: loadingAudios } = useSWR<MediaItem[] | null>(jid ? `/api/chats/media?jid=${jid}&type=audio` : null, optionalFetcher);
  const { data: docs, isLoading: loadingDocs } = useSWR<MediaItem[] | null>(jid ? `/api/chats/media?jid=${jid}&type=docs` : null, optionalFetcher);
  const { data: links, isLoading: loadingLinks } = useSWR<LinkItem[] | null>(jid ? `/api/chats/media?jid=${jid}&type=links` : null, optionalFetcher);
  const { data: customer } = useSWR<CustomerPayload | null>(customerId ? `/api/plugins/customers/${customerId}` : null, optionalFetcher);
  const badges: Partial<Record<ContextTab, number>> = {
    audios: audios?.length,
    archivos: (docs?.length ?? 0) + (customer?.attachments?.length ?? 0),
    links: links?.length,
  };

  const contactSolapa: SolapaContacto = tab === 'crm' ? 'notas' : 'chat';
  return (
    <aside className="flex min-h-[620px] min-w-0 flex-col border-t border-border bg-background p-3 xl:min-h-0 xl:border-l xl:border-t-0" aria-label="Contexto del pedido">
      <div className="mb-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Contexto rápido">
        {CONTEXT_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`produccion-contexto-${id}`} onClick={() => onTab(id)} className={cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', tab === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}><Icon className="size-3.5" />{label}{badges[id] != null && <span className={cn('rounded-full px-1.5 font-mono text-[9px]', tab === id ? 'bg-primary-foreground/15' : 'bg-background')}>{badges[id]}</span>}</button>
        ))}
      </div>
      {chats.length > 1 && <div className="mb-2 flex gap-1 overflow-x-auto">{chats.map((party) => <button key={party.id} type="button" onClick={() => onChatId(party.chatId)} className={cn('shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold', chatId === party.chatId ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border')}>{party.name}</button>)}</div>}
      {!chatId && tab !== 'archivos' ? (
        <EmptyContext icon={MessageSquare} text="Vinculá un contacto con chat al pedido para ver esta sección." />
      ) : error ? (
        <EmptyContext icon={MessageSquare} text="No se pudo cargar el contexto del chat." />
      ) : tab === 'chat' || tab === 'crm' ? (
        <PanelContacto chatId={chatId!} solapa={contactSolapa} onSolapa={() => {}} conSolapas={false} className="min-h-0 flex-1" />
      ) : tab === 'audios' ? (
        <MediaList loading={loadingAudios} empty="Este chat no tiene audios." items={(audios ?? []).map((audio) => ({ id: audio.id, title: `${audio.fromMe ? 'Enviado' : 'Cliente'} · ${shortDate(audio.timestamp)}`, content: audio.mediaUrl ? <audio controls preload="none" src={audio.mediaUrl} className="w-full" /> : <span className="text-xs text-muted-foreground">Audio no disponible</span> }))} />
      ) : tab === 'archivos' ? (
        <MediaList loading={loadingDocs} empty="No hay documentos ni adjuntos vinculados." items={[
          ...(docs ?? []).map((doc) => ({ id: `chat-${doc.id}`, title: doc.fileName || doc.mediaCaption || doc.text || `Documento · ${shortDate(doc.timestamp)}`, content: doc.mediaUrl ? <a href={doc.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary">Abrir archivo <ExternalLink className="size-3" /></a> : null })),
          ...(customer?.attachments ?? []).map((file) => ({ id: `customer-${file.id}`, title: file.fileName, content: <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary">Abrir adjunto <ExternalLink className="size-3" /></a> })),
        ]} />
      ) : (
        <MediaList loading={loadingLinks} empty="No se encontraron links ni correos en el chat." items={(links ?? []).map((link) => ({ id: link.id, title: link.value, content: <a href={link.kind === 'email' ? `mailto:${link.value}` : link.value} target={link.kind === 'url' ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary">{link.kind === 'email' ? 'Escribir correo' : 'Abrir link'} <ExternalLink className="size-3" /></a> }))} />
      )}
      {chatId && <a href={`/dashboard/chat/${chatId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-bold hover:bg-muted">Abrir conversación completa <ExternalLink className="size-3.5" /></a>}
    </aside>
  );
}

function MediaList({ loading, empty, items }: { loading: boolean; empty: string; items: Array<{ id: string; title: string; content: React.ReactNode }> }) {
  if (loading) return <div className="flex flex-1 items-center justify-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>;
  if (!items.length) return <EmptyContext icon={FileText} text={empty} />;
  return <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">{items.map((item) => <article key={item.id} className="rounded-xl border border-border bg-card p-3"><p className="break-words text-xs font-semibold">{item.title}</p>{item.content && <div className="mt-2">{item.content}</div>}</article>)}</div>;
}

function EmptyContext({ icon: Icon, text }: { icon: typeof Timer; text: string }) {
  return <div className="flex min-h-48 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground"><Icon className="mb-2 size-5" />{text}</div>;
}

function BlockFinished({ bloque, onClose }: { bloque: BloqueProduccion; onClose: () => void }) {
  const isBreak = bloque.tipo === 'descanso';
  return (
    <Dialog open={bloque.mostrarAviso} onOpenChange={(open) => { if (!open) bloque.arrancar('foco'); }}>
      <DialogContent className="max-w-xs text-center" showCloseButton={false}>
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">{isBreak ? <Coffee className="size-5" /> : <Timer className="size-5" />}</div>
        <DialogTitle className="text-base">{isBreak ? 'Se terminó el descanso' : `Bloque de ${bloque.minutos} minutos completo`}</DialogTitle>
        <DialogDescription className="text-xs">{isBreak ? 'Cuando quieras, retomá el pedido.' : 'Guardá el avance y elegí cómo continuar.'}</DialogDescription>
        <div className="space-y-2">
          <Button className="w-full" data-testid="produccion-bloque-otro" onClick={() => bloque.arrancar('foco')}>Otro bloque de 25 min</Button>
          {!isBreak && <Button variant="outline" className="w-full gap-2" data-testid="produccion-bloque-descanso" onClick={() => bloque.arrancar('descanso')}><Coffee className="size-4" />Descanso de 5 min</Button>}
          <Button variant="ghost" className="w-full" data-testid="produccion-bloque-salir" onClick={() => { bloque.terminar(); onClose(); }}>Salir de Focus</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confeti de fin de familia, dibujado a mano en un canvas.
 *
 * Es una copia del efecto del Focus comercial y no un import: son dos plugins
 * distintos y no vale la pena atar producción a un archivo de ventas por 140
 * rectángulos. No recibe clics (`pointer-events-none`) y respeta
 * `prefers-reduced-motion`: quien pidió que no se muevan las cosas no recibe
 * una lluvia de papelitos en la cara.
 */
const COLORES_CONFETI = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#eab308'];
const CANTIDAD_CONFETI = 140;
const DURACION_CONFETI_MS = 2800;

type Papelito = { x: number; y: number; vx: number; vy: number; giro: number; vGiro: number; ancho: number; alto: number; color: string };

function Confeti({ activo }: { activo: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!activo) return;
    const canvas = ref.current;
    if (!canvas) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${alto}px`;
    ctx.scale(dpr, dpr);

    const papelitos: Papelito[] = Array.from({ length: CANTIDAD_CONFETI }, () => ({
      // Salen de los dos costados hacia el centro: cae desde arriba parece
      // lluvia, y esto parece una celebración.
      x: ancho * (Math.random() < 0.5 ? 0.08 : 0.92) + (Math.random() - 0.5) * 80,
      y: alto * 0.45 + (Math.random() - 0.5) * 120,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 13 - 4,
      giro: Math.random() * Math.PI,
      vGiro: (Math.random() - 0.5) * 0.35,
      ancho: 5 + Math.random() * 6,
      alto: 3 + Math.random() * 5,
      color: COLORES_CONFETI[Math.floor(Math.random() * COLORES_CONFETI.length)],
    }));

    const inicio = performance.now();
    let frame = 0;

    const dibujar = (t: number) => {
      const transcurrido = t - inicio;
      if (transcurrido > DURACION_CONFETI_MS) {
        ctx.clearRect(0, 0, ancho, alto);
        return;
      }
      const opacidad = transcurrido > DURACION_CONFETI_MS * 0.6 ? 1 - (transcurrido - DURACION_CONFETI_MS * 0.6) / (DURACION_CONFETI_MS * 0.4) : 1;
      ctx.clearRect(0, 0, ancho, alto);
      ctx.globalAlpha = Math.max(0, opacidad);
      for (const p of papelitos) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.vGiro;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
        ctx.restore();
      }
      frame = window.requestAnimationFrame(dibujar);
    };

    frame = window.requestAnimationFrame(dibujar);
    return () => window.cancelAnimationFrame(frame);
  }, [activo]);

  if (!activo) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70]" />;
}
