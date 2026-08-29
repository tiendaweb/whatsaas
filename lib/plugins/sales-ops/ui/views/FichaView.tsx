'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ActionRow, AnalysisDetail, AnalysisVersionRow, DetailPayload, SignalRow, TimelineGap, TimelineHit } from '../../shared/api-types';
import { ANALYSIS_STATUSES, GATES, GATE_LABELS, type AnalysisStatus, type Gate } from '../../shared/taxonomy';
import { GateBadge } from '../components/GateBadge';
import { FichaChat } from '../components/FichaChat';
import { TemperatureIcon } from '../components/PriorityPill';
import { ErrorState } from '../components/States';
import {
  ACTION_KIND_LABELS,
  ACTION_STATUS_LABELS,
  OWNER_LABELS,
  SALES_OPS_API,
  SIGNAL_LABELS,
  STATUS_LABELS,
  WARNING_LABELS,
  WHO_LABELS,
  diasTexto,
  fetcher,
  fmtDate,
  fmtDateShort,
  fmtDateTime,
  fmtInt,
  fmtMoney,
  fmtPct,
  humanize,
  iniciales,
  tiempoRelativo,
} from '../components/format';

type Header = {
  chatId: number;
  contactId: number | null;
  name: string;
  phoneMasked: string;
  avatarUrl: string | null;
  remoteJid?: string;
  instanceId?: number | null;
  customData?: Record<string, unknown>;
  contactNotes?: string | null;
  tags?: Array<{ id: number; name: string; color: string | null }>;
};
type Payload = DetailPayload & { header: Header };

type Props = { chatId: number; onClose?: () => void };

export function FichaView({ chatId }: Props) {
  const { data, error, isLoading, mutate } = useSWR<Payload>(`${SALES_OPS_API}/contacts/${chatId}`, fetcher);

  if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;
  if (isLoading || !data) return <FichaSkeleton />;

  const a = data.analysis;
  const h = data.header;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 pb-3">
        <Avatar className="size-11 shrink-0">
          {h.avatarUrl && <AvatarImage src={h.avatarUrl} alt="" />}
          <AvatarFallback>{iniciales(h.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">{h.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {h.phoneMasked} · chat {h.chatId}
            {h.contactId != null && <> · contacto {h.contactId}</>}
          </p>
          {a?.firstContactAt && (
            <p className="truncate text-xs text-muted-foreground">
              Entró {fmtDate(a.firstContactAt)} por {humanize(a.source).toLowerCase()}
              {a.sourceDetail && <> (&ldquo;{a.sourceDetail}&rdquo;)</>}
            </p>
          )}
        </div>
      </header>

      <Tabs defaultValue="resumen" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-9 w-full shrink-0 flex-nowrap justify-start gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <TabsTrigger className="shrink-0 flex-none px-2.5 text-xs" value="resumen">Resumen</TabsTrigger>
          <TabsTrigger className="shrink-0 flex-none px-2.5 text-xs" value="timeline">Timeline</TabsTrigger>
          <TabsTrigger className="shrink-0 flex-none px-2.5 text-xs" value="chat">Chat</TabsTrigger>
          <TabsTrigger className="shrink-0 flex-none px-2.5 text-xs" value="acciones">Acciones{data.actions.length ? ` (${data.actions.length})` : ''}</TabsTrigger>
          <TabsTrigger className="shrink-0 flex-none px-2.5 text-xs" value="versiones">Versiones{data.versions.length ? ` (${data.versions.length})` : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen" className="mt-3">
          {a ? <Resumen a={a} onOverride={() => void mutate()} /> : <SinAnalisis chatId={chatId} onOverride={() => void mutate()} />}
          <ContextoContacto header={h} timeline={data.timeline} />
          <DejarPromptBlock chatId={chatId} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-3">
          <Timeline items={data.timeline} chatHref={data.chatHref} signals={data.signals} />
        </TabsContent>
        <TabsContent value="chat" className="mt-3 flex min-h-[60vh] flex-1 flex-col">
          <FichaChat chatId={chatId} chatHref={data.chatHref} className="flex min-h-0 flex-1 flex-col" />
        </TabsContent>
        <TabsContent value="acciones" className="mt-3">
          <Acciones actions={data.actions} signals={data.signals} />
        </TabsContent>
        <TabsContent value="versiones" className="mt-3">
          <Versiones versions={data.versions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Resumen ─────────────────────────────────────────────────────────────────

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Resumen({ a, onOverride }: { a: AnalysisDetail; onOverride: () => void }) {
  const analyzedText = a.analyzedAt ? `analizado ${tiempoRelativo(a.analyzedAt)}${a.analyzedBy ? ` por ${humanize(a.analyzedBy)}` : ''}` : 'sin analizar';
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <GateBadge gate={a.currentGate} withLabel className="text-xs" />
          <span className="text-xs text-muted-foreground">
            confianza <span className="tabular-nums text-foreground">{a.confidence}</span> · {analyzedText}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Máx. alcanzada {a.maxGate} · cayó en {a.dropGate} · motivo: {humanize(a.dropReason).toLowerCase()}
          {a.stale && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">desactualizado</span>}
          {a.analyzedAt && a.confidence < 55 && <span className="ml-1 rounded bg-muted px-1 text-[10px] font-medium">revisar</span>}
        </p>
      </section>

      <Field label="Resumen IA">{a.proposalSummary || a.notesForHuman || '—'}</Field>

      <dl className="grid grid-cols-1 gap-3">
        <Field label="Última acción del prospecto">
          {a.lastProspectAction ? <>&ldquo;{a.lastProspectAction}&rdquo;</> : '—'}
          {a.lastCustomerMessageAt && <span className="text-muted-foreground"> · {tiempoRelativo(a.lastCustomerMessageAt)}</span>}
        </Field>
        <Field label="Última acción nuestra">
          {a.lastTeamAction || '—'}
          {a.lastTeamMessageAt && <span className="text-muted-foreground"> · {fmtDateShort(a.lastTeamMessageAt)}</span>}
        </Field>
      </dl>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
        <Field label="Necesidad">
          {humanize(a.need)}
          {a.needDetail && <span className="block text-xs text-muted-foreground">{a.needDetail}</span>}
        </Field>
        <Field label="Precio conocido">{a.quotedPrice ? fmtMoney(a.quotedPrice.amount / 100, a.quotedPrice.currency) : '—'}</Field>
        <Field label="Rubro">{a.businessType || '—'}</Field>
        <Field label="Objeción">
          {humanize(a.objectionType)}
          {a.objectionDetail && <span className="block text-xs text-muted-foreground">{a.objectionDetail}</span>}
        </Field>
        <Field label="Intención">
          {humanize(a.intent)} <span className="tabular-nums text-muted-foreground">({a.intentScore})</span>
        </Field>
        <Field label="Temperatura">
          <span className="inline-flex items-center gap-1">
            <TemperatureIcon temperature={a.temperature} /> {humanize(a.temperature)}
          </span>
        </Field>
        <Field label="Impactos">
          {a.followupsTotal} <span className="text-muted-foreground">({a.followupsAutomated} auto · {a.followupsManual} manuales)</span>
        </Field>
        <Field label="Último impacto">{a.lastFollowupAt ? tiempoRelativo(a.lastFollowupAt) : '—'}</Field>
        <Field label="Automatización">{a.automationActive ? 'sí' : 'no'}</Field>
        <Field label="Cliente">
          {a.isExistingCustomer ? 'sí' : 'no'} <span className="text-muted-foreground">(evidencia: {a.customerEvidence})</span>
        </Field>
        <Field label="Pago pendiente">{a.paymentPending ? 'sí' : 'no'}</Field>
        <Field label="Silencio">{diasTexto(a.daysSilent)}</Field>
        <Field label="Probabilidad">{fmtPct(a.recoveryProbability)}</Field>
        <Field label="Valor">USD {fmtInt(a.potentialValueUsd)}</Field>
        <Field label="Velocidad">{humanize(a.collectionSpeed)}</Field>
        <Field label="Prioridad">
          <span className="font-semibold tabular-nums">{fmtInt(a.priorityScore)}</span>
        </Field>
        <Field label="Estado">
          {STATUS_LABELS[a.status] ?? a.status}
          {a.nextActionAt && <span className="block text-xs text-muted-foreground">próxima: {fmtDate(a.nextActionAt)}</span>}
        </Field>
        <Field label="Versión">
          v{a.version}
          {a.model && <span className="block truncate text-xs text-muted-foreground">{a.model}</span>}
        </Field>
      </dl>

      {(a.evidenceGap || a.autoReplyDetected) && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {a.evidenceGap && 'Hay audios sin transcribir u otro hueco de evidencia. '}
          {a.autoReplyDetected && 'Este contacto tiene respuestas automáticas.'}
        </p>
      )}

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Siguiente acción</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{a.recommendedAction || '—'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Responsable <span className="text-foreground">{OWNER_LABELS[a.recommendedOwner] ?? a.recommendedOwner}</span> · Destino{' '}
          <span className="text-foreground">{STATUS_LABELS[a.status] ?? a.status}</span>
          {a.statusReason && <> · {a.statusReason}</>}
        </p>
        <TooltipProvider delayDuration={200}>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Proponer envío', 'Crear tarea', 'Registrar cobro'].map((label) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled>
                      {label}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Fase 6</TooltipContent>
              </Tooltip>
            ))}
            <ClasificarAhoraButton chatId={a.chatId} onDone={onOverride} />
            <OverrideDialog chatId={a.chatId} currentGate={a.currentGate} currentStatus={a.status} onDone={onOverride} />
          </div>
        </TooltipProvider>
      </section>

      {(a.notesForHuman || a.crmToFix) && (
        <dl className="space-y-3">
          {a.notesForHuman && <Field label="Notas para el humano">{a.notesForHuman}</Field>}
          {a.crmToFix && <Field label="CRM a corregir">{a.crmToFix}</Field>}
        </dl>
      )}
    </div>
  );
}

function SinAnalisis({ chatId, onOverride }: { chatId: number; onOverride: () => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-4 text-center">
      <p className="text-sm font-medium">Este chat todavía no fue analizado</p>
      <p className="text-xs text-muted-foreground">El timeline ya está disponible en la pestaña correspondiente. Podés fijar un gate a mano mientras tanto.</p>
      <div className="flex justify-center gap-2">
        <ClasificarAhoraButton chatId={chatId} onDone={onOverride} />
        <OverrideDialog chatId={chatId} currentGate={null} currentStatus={null} onDone={onOverride} />
      </div>
    </div>
  );
}

/** Clasifica con el motor del servidor; si no hay cuota de IA, el chat queda en la cola de conectores. */
function ClasificarAhoraButton({ chatId, onDone }: { chatId: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${SALES_OPS_API}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, engine: 'server' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(String(body?.error ?? `Error ${response.status}`));
        return;
      }
      if (body?.aiUsed === false) {
        toast.warning('Sin cuota de IA en el servidor: el chat quedó en la cola de conectores. Ejecutalo desde Claude/ChatGPT/Grok con el prompt P9 (vista Cola).', { duration: 8000 });
      } else {
        toast.success(`Clasificado: ${body?.gate ?? 'ok'} · confianza ${body?.confidence ?? '—'}`);
      }
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo clasificar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={run}>
      {busy ? 'Clasificando…' : 'Clasificar ahora'}
    </Button>
  );
}

// ── Contexto del contacto: campos personalizados y notas internas ───────────

function ContextoContacto({ header, timeline }: { header: Header; timeline: DetailPayload['timeline'] }) {
  const custom = Object.entries(header.customData ?? {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object');
  const notas = timeline.filter((t): t is TimelineHit => 'who' in t && t.who === 'nota').slice(-8).reverse();
  if (!custom.length && !notas.length && !header.contactNotes && !(header.tags?.length)) return null;
  return (
    <div className="mt-4 space-y-3">
      {(custom.length > 0 || header.tags?.length) && (
        <section className="rounded-xl border border-border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Campos del contacto</p>
          {header.tags && header.tags.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Etiquetas: <span className="text-foreground">{header.tags.map((t) => t.name).join(' · ')}</span></p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            {custom.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="truncate text-[10px] text-muted-foreground">{k.replace(/_/g, ' ')}</dt>
                <dd className="break-words text-xs text-foreground">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {(notas.length > 0 || header.contactNotes) && (
        <section className="rounded-xl border border-border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Notas internas</p>
          {header.contactNotes && <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{header.contactNotes}</p>}
          <ul className="mt-2 space-y-1.5">
            {notas.map((n) => (
              <li key={n.id} className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs">
                <span className="text-muted-foreground">{tiempoRelativo(n.at)} · </span>
                <span className="whitespace-pre-wrap">{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Dejar un prompt al conector (entra a la cola de ejecución) ──────────────

function DejarPromptBlock({ chatId }: { chatId: number }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, mutate } = useSWR<{ runs: Array<{ id: number; title: string; status: string; summary: string | null; createdAt: string }> }>(`${SALES_OPS_API}/prompts/queue?status=all&chatId=${chatId}`, fetcher);
  const submit = async () => {
    if (text.trim().length < 5) {
      toast.error('Escribí qué tiene que hacer el conector (mínimo 5 caracteres).');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${SALES_OPS_API}/prompts/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.trim(), targetKind: 'chat', targetId: chatId }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(body?.error ?? `Error ${r.status}`));
      toast.success('Quedó en la cola de conectores. Se ejecuta con el prompt P9 (vista Cola).');
      setText('');
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setBusy(false);
    }
  };
  const runs = data?.runs ?? [];
  return (
    <section className="mt-4 rounded-xl border border-border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dejar un prompt al conector</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Lo que escribas queda en la cola de ejecución y lo corre Claude, ChatGPT o Grok con el contexto de este chat.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Ej.: Redactá el mensaje para confirmar el plan Combo Full y pedir la seña; no lo envíes." className="mt-2 text-sm" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={busy} onClick={submit}>{busy ? 'Encolando…' : 'Encolar para el conector'}</Button>
      </div>
      {runs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {runs.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                {r.summary && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{r.summary}</p>}
              </div>
              <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px]', r.status === 'completed' ? 'bg-primary/10 text-foreground' : r.status === 'queued' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-muted text-muted-foreground')}>
                {r.status === 'queued' ? 'en cola' : r.status === 'in_progress' ? 'en curso' : r.status === 'completed' ? 'hecho' : r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Override manual ────────────────────────────────────────────────────────

function OverrideDialog({
  chatId,
  currentGate,
  currentStatus,
  onDone,
}: {
  chatId: number;
  currentGate: Gate | null;
  currentStatus: AnalysisStatus | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState<Gate>(currentGate ?? 'G0');
  const [status, setStatus] = useState<AnalysisStatus>(currentStatus ?? 'recuperado');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 5) {
      toast.error('El motivo es obligatorio (mínimo 5 caracteres).');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${SALES_OPS_API}/classify/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, gate, status, reason: reason.trim() }),
      });
      if (response.status === 404) {
        toast.error('El override manual todavía no está disponible en el servidor.');
        return;
      }
      if (!response.ok) {
        let msg = `Error ${response.status}`;
        try {
          const body = await response.json();
          if (body?.error) msg = String(body.error);
        } catch {
          /* sin cuerpo */
        }
        toast.error(msg);
        return;
      }
      toast.success(`Gate cambiado a ${gate}.`);
      setOpen(false);
      setReason('');
      onDone();
    } catch {
      toast.error('No se pudo conectar con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(true)}>
        Cambiar gate manualmente
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar gate manualmente</DialogTitle>
          <DialogDescription>Crea una versión `manual_override`. La IA respeta el gate hasta que el chat cambie.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Gate</span>
              <Select value={gate} onValueChange={(v) => setGate(v as Gate)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GATES.map((g) => (
                    <SelectItem key={g} value={g}>{g} · {GATE_LABELS[g]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Destino</span>
              <Select value={status} onValueChange={(v) => setStatus(v as AnalysisStatus)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANALYSIS_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <label className="block space-y-1 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Motivo (obligatorio)</span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Qué viste en el chat que la IA no vio" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

const WHO_TONES: Record<string, string> = {
  cliente: 'bg-primary',
  humano: 'bg-foreground/70',
  bot: 'bg-muted-foreground/60',
  ia: 'bg-violet-500',
  nota: 'bg-amber-500',
};

const FLAG_LABELS: Record<string, string> = {
  precio: 'precio',
  pago: 'pago',
  objecion: 'objeción',
  compromiso: 'compromiso',
  rechazo: 'rechazo',
  auto: 'auto',
};

function isGap(item: TimelineHit | TimelineGap): item is TimelineGap {
  return 'kind' in item && (item.kind === 'silence' || item.kind === 'omitted');
}

function Timeline({ items, chatHref, signals }: { items: Array<TimelineHit | TimelineGap>; chatHref: string; signals: SignalRow[] }) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Este chat no tiene mensajes.</p>;
  }
  const lastSignal = signals[0];
  return (
    <ol className="relative ml-2 border-l border-border pl-4">
      {items.map((item, i) => {
        if (isGap(item)) {
          const days = Math.max(1, Math.round((Date.parse(item.to) - Date.parse(item.from)) / 86_400_000));
          return (
            <li key={`gap-${i}`} className="relative py-2">
              <span className="absolute -left-[1.3rem] top-1/2 h-px w-3 -translate-y-1/2 bg-border" aria-hidden />
              <p className="text-[11px] italic text-muted-foreground">
                {item.kind === 'silence' ? `── silencio · ${days} días` : `── ${item.count} mensajes omitidos`}
                {item.kind === 'silence' && item.count > 0 && ` · ${item.count} mensajes`} ──
              </p>
            </li>
          );
        }
        const flags = item.flags.filter((f) => f !== 'auto');
        return (
          <li key={item.id} className="relative py-1.5">
            <span className={cn('absolute -left-[1.3rem] top-3 size-2 rounded-full ring-2 ring-background', WHO_TONES[item.who] ?? 'bg-muted-foreground')} aria-hidden />
            <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{fmtDateShort(item.at)}</span>
              <span className="font-semibold tracking-wide">{WHO_LABELS[item.who] ?? item.who}</span>
              {item.flags.includes('auto') && <span className="rounded bg-muted px-1 text-[10px]">auto</span>}
              {item.evidenceOf.length > 0 && (
                <span className="rounded bg-primary/10 px-1 text-[10px] text-primary" title={`Evidencia de: ${item.evidenceOf.join(', ')}`}>
                  evidencia {item.evidenceOf.join('/')}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-foreground">
              {item.text || <span className="italic text-muted-foreground">[sin texto]</span>}
              {flags.length > 0 && (
                <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                  {flags.map((f) => (
                    <span key={f} className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      <Flag className="size-2.5" aria-hidden /> {FLAG_LABELS[f] ?? f}
                    </span>
                  ))}
                </span>
              )}
              <a href={`${chatHref}&messageId=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer" className="ml-1.5 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                ver
              </a>
            </p>
          </li>
        );
      })}
      <li className="relative py-1.5">
        <span className="absolute -left-[1.3rem] top-3 size-2 rounded-full bg-sky-500 ring-2 ring-background" aria-hidden />
        <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{fmtDateShort(lastSignal?.createdAt ?? new Date().toISOString())}</span>
          <span className="font-semibold tracking-wide">RADAR</span>
        </div>
        <p className="mt-0.5 text-sm text-foreground">
          {lastSignal ? (
            <>
              {SIGNAL_LABELS[lastSignal.kind] ?? lastSignal.kind}
              {lastSignal.excerpt && <span className="text-muted-foreground"> · &ldquo;{lastSignal.excerpt}&rdquo;</span>}
            </>
          ) : (
            'sin señal'
          )}
        </p>
      </li>
    </ol>
  );
}

// ── Acciones y versiones ───────────────────────────────────────────────────

function Acciones({ actions, signals }: { actions: ActionRow[]; signals: SignalRow[] }) {
  if (actions.length === 0 && signals.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin acciones ni señales todavía.</p>;
  }
  return (
    <div className="space-y-4">
      {actions.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-xl border border-border">
          {actions.map((x) => (
            <li key={x.id} className="space-y-1 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{ACTION_KIND_LABELS[x.kind] ?? x.kind}</span>
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{ACTION_STATUS_LABELS[x.status] ?? x.status}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {x.batchLabel} · {fmtDateTime(x.createdAt)} · propuso {x.proposedBy}
                {x.gateAtCreation && <> · {x.gateAtCreation}</>}
                {x.variant && <> · variante {x.variant}</>}
              </p>
              {typeof x.payload?.text === 'string' && <p className="line-clamp-3 text-xs text-foreground/80">&ldquo;{x.payload.text}&rdquo;</p>}
              {x.executedAt && <p className="text-xs text-muted-foreground">Ejecutada {fmtDateTime(x.executedAt)}{x.executedVia && ` vía ${x.executedVia}`}</p>}
              {x.result && Object.keys(x.result).length > 0 && (
                <p className="truncate text-xs text-muted-foreground">Resultado: {JSON.stringify(x.result)}</p>
              )}
              {x.warnings.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">{x.warnings.map((w) => WARNING_LABELS[w] ?? w).join(' · ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {signals.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Señales del radar</p>
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {signals.map((s) => (
              <li key={s.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{SIGNAL_LABELS[s.kind] ?? s.kind}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {tiempoRelativo(s.createdAt)} · {s.status}
                    {s.gateBefore && s.gateAfter && <> · {s.gateBefore}→{s.gateAfter}</>}
                  </span>
                </div>
                {s.excerpt && <p className="truncate text-xs text-muted-foreground">&ldquo;{s.excerpt}&rdquo;</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Versiones({ versions }: { versions: AnalysisVersionRow[] }) {
  if (versions.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin versiones todavía.</p>;
  }
  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border">
      {versions.map((v) => {
        const diffEntries = Object.entries(v.diff ?? {});
        return (
          <li key={v.id} className="space-y-1 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">v{v.version}</span>
                <GateBadge gate={v.currentGate} />
                <span className="text-xs text-muted-foreground">confianza {v.confidence}</span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDateTime(v.createdAt)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {humanize(v.reason)} · {v.analyzedBy ? humanize(v.analyzedBy) : 'motor'}
              {v.createdBy != null && <> · usuario {v.createdBy}</>}
            </p>
            {diffEntries.length > 0 && (
              <ul className="space-y-0.5 text-[11px]">
                {diffEntries.slice(0, 8).map(([key, d]) => (
                  <li key={key} className="truncate">
                    <span className="text-muted-foreground">{key}:</span> {String(d.from ?? '—')} → <span className="text-foreground">{String(d.to ?? '—')}</span>
                  </li>
                ))}
                {diffEntries.length > 8 && <li className="text-muted-foreground">… {diffEntries.length - 8} cambios más</li>}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FichaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
