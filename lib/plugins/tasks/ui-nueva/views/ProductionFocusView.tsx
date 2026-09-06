'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft,
  Bot,
  Cable,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { DetailPayload } from '@/lib/plugins/sales-ops/shared/api-types';
import { fetcher, SALES_OPS_API } from '@/lib/plugins/sales-ops/ui/components/format';
import { PanelContacto, type SolapaContacto } from '@/lib/plugins/sales-ops/ui/focus/PanelContacto';
import { Reloj } from '@/lib/plugins/sales-ops/ui/focus/Reloj';
import { useBloque } from '@/lib/plugins/sales-ops/ui/focus/useBloque';
import type { ProductionOrder, ProductionOsPayload } from '@/lib/plugins/tasks/server/production-os';
import { WORK_STATUS_META, WORK_STATUS_TRANSITIONS, type WorkStatus } from '@/lib/plugins/tasks/shared/produccion';

type FocusScope = 'all' | 'demo' | 'cliente';
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

export function ProductionFocusView({ orders, initialOrderId, members, onClose, onChanged }: {
  orders: ProductionOrder[];
  initialOrderId: number;
  members: ProductionOsPayload['members'];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [scope, setScope] = useState<FocusScope>('all');
  const scoped = useMemo(() => orders.filter((order) => scope === 'all' || (scope === 'demo' ? order.family === 'demo' : order.family !== 'demo')), [orders, scope]);
  const [selectedId, setSelectedId] = useState(initialOrderId);
  const selectedIndex = Math.max(0, scoped.findIndex((order) => order.id === selectedId));
  const order = scoped[selectedIndex] ?? null;
  const [tab, setTab] = useState<ContextTab>('chat');
  const [chatId, setChatId] = useState<number | null>(order?.parties.find((party) => party.chatId)?.chatId ?? null);
  const bloque = useBloque('sales-ops-production-focus-block-v1');

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

  const move = (delta: number) => {
    const next = scoped[selectedIndex + delta];
    if (next) setSelectedId(next.id);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-background text-foreground [--tareas-accent:var(--primary)] [--t-bg:var(--background)] [--t-surface:var(--card)] [--t-surface-2:var(--muted)] [--t-text:var(--foreground)] [--t-text-secondary:var(--muted-foreground)] [--t-muted:var(--muted-foreground)] [--t-border:var(--border)] [--t-hover:var(--muted)]">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-2 py-1.5 sm:px-3">
        <Button variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 text-muted-foreground" onClick={onClose}>
          <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Volver a Producción</span>
        </Button>
        <TimerButton bloque={bloque} />
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-black">{order?.title ?? 'Sin proyectos en este recorte'}</p>
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{order ? `${order.projectName} · ${WORK_STATUS_META[order.workStatus].label}` : 'Cambiá el filtro para continuar'}</p>
        </div>
        <div className="grid grid-cols-3 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Tipo de proyecto">
          {([['all', 'Todos'], ['demo', 'Demos'], ['cliente', 'Clientes']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={scope === id} onClick={() => setScope(id)} className={cn('min-h-8 rounded-md px-2 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', scope === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>{label}</button>
          ))}
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="size-8" disabled={selectedIndex <= 0} onClick={() => move(-1)} aria-label="Proyecto anterior"><ChevronLeft className="size-4" /></Button>
          <span className="min-w-12 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{order ? selectedIndex + 1 : 0}/{scoped.length}</span>
          <Button variant="ghost" size="icon" className="size-8" disabled={selectedIndex >= scoped.length - 1} onClick={() => move(1)} aria-label="Proyecto siguiente"><ChevronRight className="size-4" /></Button>
        </div>
      </header>

      {!order ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">No hay proyectos abiertos para este filtro.</div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[260px_minmax(480px,1fr)_440px] xl:overflow-hidden">
          <ProjectQueue orders={scoped} selectedId={order.id} onSelect={setSelectedId} />
          <main className="min-w-0 xl:overflow-y-auto">
            <ProjectWorkPanel order={order} members={members} onChanged={onChanged} onAdvance={() => move(1)} />
          </main>
          <ContextPanel order={order} tab={tab} onTab={setTab} chatId={chatId} onChatId={setChatId} />
        </div>
      )}

      <BlockFinished bloque={bloque} onClose={onClose} />
    </div>
  );
}

function TimerButton({ bloque }: { bloque: ReturnType<typeof useBloque> }) {
  const action = () => !bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar();
  return (
    <button type="button" onClick={action} title={!bloque.hayBloque ? 'Iniciar un bloque de 25 minutos' : bloque.pausado ? 'Reanudar bloque' : 'Pausar bloque'} className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', bloque.pausado ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-card')}>
      {!bloque.hayBloque ? <Timer className="size-4" /> : bloque.pausado ? <Play className="size-4" /> : <Pause className="size-4" />}
      {bloque.hayBloque ? <Reloj terminaEn={bloque.terminaEn} pausadoCon={bloque.pausadoCon} /> : '25:00'}
    </button>
  );
}

function ProjectQueue({ orders, selectedId, onSelect }: { orders: ProductionOrder[]; selectedId: number; onSelect: (id: number) => void }) {
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-r border-border bg-muted/30 p-2 xl:block" aria-label="Proyectos de producción">
      <p className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Proyectos para hacer · {orders.length}</p>
      <div className="space-y-1">
        {orders.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={cn('w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selectedId === item.id ? 'border-primary/35 bg-primary/10' : 'border-transparent hover:bg-card')}>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.family === 'demo' ? <Globe2 className="size-3" /> : <UsersRound className="size-3" />}{item.family === 'demo' ? 'Demo' : 'Cliente'}</span>
            <span className="mt-1 block line-clamp-2 text-sm font-bold leading-snug">{item.title}</span>
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.assigneeName ?? 'Sin responsable'} · {Math.round(item.progress * 100)}%</span>
          </button>
        ))}
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
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el proyecto.');
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
    void patch({ workStatus: next, ...(next === 'espera_cliente' ? { blockedReason } : {}), ...(next === 'entregado' ? { deliveryUrl } : {}) }, `Proyecto marcado como ${WORK_STATUS_META[next].label.toLocaleLowerCase('es')}.`);
  };

  return (
    <article className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{WORK_STATUS_META[order.workStatus].label}</span><h1 className="mt-3 text-2xl font-black leading-tight">{order.title}</h1><p className="mt-1 text-xs text-muted-foreground">{order.workspaceName} · {order.projectName} · {order.family === 'demo' ? 'Demo' : 'Cliente'}</p></div>
        <a href={`/plugins/tasks?proyecto=${order.projectId}`} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted">Abrir tablero <ExternalLink className="size-3.5" /></a>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5"><span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Responsable</span><select value={order.assigneeId ?? ''} disabled={busy} onChange={(event) => void patch({ assigneeId: event.target.value ? Number(event.target.value) : null }, 'Responsable actualizado.')} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Sin asignar</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Avance</p><p className="mt-1 text-xl font-black tabular-nums">{Math.round(order.progress * 100)}%</p></div>
      </div>
      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-black">Checklist de este bloque</h2><span className="text-xs font-bold tabular-nums text-muted-foreground">{order.checklistDone}/{order.checklist.length}</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(order.progress * 100)}%` }} /></div>
        <div className="mt-3 space-y-1">{order.checklist.length ? order.checklist.map((item, index) => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-xl px-2 py-2 hover:bg-muted"><input type="checkbox" checked={item.completed} disabled={busy} onChange={() => void patch({ checklist: order.checklist.map((step, current) => current === index ? { ...step, completed: !step.completed } : step) }, 'Checklist actualizado.')} className="mt-0.5 size-4 accent-primary" /><span className={cn('text-sm', item.completed && 'line-through opacity-55')}>{item.text}</span></label>) : <p className="text-sm text-muted-foreground">Agregá los pasos desde la tarea del tablero.</p>}</div>
      </section>
      {order.notes && <section className="mt-5"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Contexto del pedido</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{order.notes}</p></section>}
      <section className="mt-5 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300"><Bot className="size-4" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black">Prompt de producción</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Editalo acá y elegí si lo resuelve el banco Gemini o si queda disponible para un conector con herramientas.</p>
          </div>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Prompt de producción</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} maxLength={20000} placeholder="Describí el resultado esperado, las fuentes que debe usar y los límites que tiene que respetar." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy || prompt === order.aiPrompt} className="gap-1.5" onClick={() => void patch({ aiPrompt: prompt }, 'Prompt guardado.')}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />} Guardar prompt
          </Button>
          <Button type="button" size="sm" disabled={busy || prompt.trim().length < 5} className="gap-1.5 bg-sky-600 text-white hover:bg-sky-700" onClick={() => void executeWithApi()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} Ejecutar con API Gemini
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || prompt.trim().length < 5} className="gap-1.5" onClick={() => void leaveForConnector()}>
            <Cable className="size-3.5" aria-hidden /> Dejar para conector
          </Button>
        </div>
        {order.aiReadyAt && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300"><Cable className="size-3.5" aria-hidden /> Disponible en la cola de conectores</p>}
        {order.lastAiRun && (
          <div className={cn('mt-3 rounded-xl border p-3', order.lastAiRun.status === 'completed' ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-destructive/25 bg-destructive/10')}>
            <p className="flex items-center gap-1.5 text-xs font-bold">{order.lastAiRun.status === 'completed' ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> : <Bot className="size-3.5 text-destructive" aria-hidden />}{order.lastAiRun.status === 'completed' ? 'Último resultado de Gemini' : 'La última ejecución falló'}</p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-foreground/85">{order.lastAiRun.summary}</p>
          </div>
        )}
      </section>
      <section className="mt-5 space-y-3 border-t border-border pt-5">
        <div><h2 className="text-sm font-black">Cerrar el siguiente movimiento</h2><p className="text-xs text-muted-foreground">{WORK_STATUS_META[order.workStatus].ayuda}</p></div>
        {WORK_STATUS_TRANSITIONS[order.workStatus].includes('espera_cliente') && <textarea value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} rows={2} placeholder="Qué falta del cliente…" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />}
        {WORK_STATUS_TRANSITIONS[order.workStatus].includes('entregado') && <input value={deliveryUrl} onChange={(event) => setDeliveryUrl(event.target.value)} type="url" placeholder="https://… enlace de entrega" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />}
        <div className="flex flex-wrap gap-2">{WORK_STATUS_TRANSITIONS[order.workStatus].map((next, index) => <Button key={next} disabled={busy} variant={index === 0 ? 'default' : 'outline'} size="sm" onClick={() => transition(next)}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : WORK_STATUS_META[next].label}</Button>)}</div>
      </section>
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
    <aside className="flex min-h-[620px] min-w-0 flex-col border-t border-border bg-background p-3 xl:min-h-0 xl:border-l xl:border-t-0" aria-label="Contexto del proyecto">
      <div className="mb-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Contexto rápido">
        {CONTEXT_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)} className={cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', tab === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}><Icon className="size-3.5" />{label}{badges[id] != null && <span className={cn('rounded-full px-1.5 font-mono text-[9px]', tab === id ? 'bg-primary-foreground/15' : 'bg-background')}>{badges[id]}</span>}</button>
        ))}
      </div>
      {chats.length > 1 && <div className="mb-2 flex gap-1 overflow-x-auto">{chats.map((party) => <button key={party.id} type="button" onClick={() => onChatId(party.chatId)} className={cn('shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold', chatId === party.chatId ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border')}>{party.name}</button>)}</div>}
      {!chatId && tab !== 'archivos' ? (
        <EmptyContext icon={MessageSquare} text="Vinculá un contacto con chat al proyecto para ver esta sección." />
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

function BlockFinished({ bloque, onClose }: { bloque: ReturnType<typeof useBloque>; onClose: () => void }) {
  const isBreak = bloque.tipo === 'descanso';
  return (
    <Dialog open={bloque.mostrarAviso} onOpenChange={(open) => { if (!open) bloque.arrancar('foco'); }}>
      <DialogContent className="max-w-xs text-center" showCloseButton={false}>
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">{isBreak ? <Coffee className="size-5" /> : <Timer className="size-5" />}</div>
        <DialogTitle className="text-base">{isBreak ? 'Se terminó el descanso' : 'Bloque de 25 minutos completo'}</DialogTitle>
        <DialogDescription className="text-xs">{isBreak ? 'Cuando quieras, retomá el proyecto.' : 'Guardá el avance y elegí cómo continuar.'}</DialogDescription>
        <div className="space-y-2"><Button className="w-full" onClick={() => bloque.arrancar('foco')}>Otro bloque de 25 min</Button>{!isBreak && <Button variant="outline" className="w-full gap-2" onClick={() => bloque.arrancar('descanso')}><Coffee className="size-4" />Descanso de 5 min</Button>}<Button variant="ghost" className="w-full" onClick={() => { bloque.terminar(); onClose(); }}>Salir de Focus</Button></div>
      </DialogContent>
    </Dialog>
  );
}
