'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, Flag, GitBranch, History, ListChecks, Loader2, MessageSquare, Radar as RadarIcon, SendHorizontal, Sparkles, UserSquare2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { tituloCliente, type ActionRow, type AnalysisDetail, type AnalysisVersionRow, type DetailPayload, type HistoryEntry, type HistoryPayload, type SignalRow, type TimelineGap, type TimelineHit } from '../../shared/api-types';
import { ANALYSIS_STATUSES, GATES, GATE_LABELS, type ActionKind, type AnalysisStatus, type Gate } from '../../shared/taxonomy';
import { GateBadge } from '../components/GateBadge';
import { FichaDock, type DockItem } from '../components/FichaDock';
import { HISTORIAL_ICONOS, HISTORIAL_TONOS } from '../components/historial-meta';
import { FallaCorrida } from '../skills/FallaCorrida';
import { avisarEncolado } from '../components/eventos';
import { ScoreRadar, ejesDeAnalisis } from '../components/ScoreRadar';
import { ResponsiveModal } from '../skills/ResponsiveModal';
import { FichaChat } from '../components/FichaChat';
import { KIND_META } from '../radar/kind-meta';
import { TemperatureIcon } from '../components/PriorityPill';
import { ErrorState } from '../components/States';
import { SiguienteAccion } from '../skills/SiguienteAccion';
import { ProponerAccionDialog } from '../cola/ProponerAccionDialog';
import { CrmFixCard } from '../components/CrmFixCard';
import { CrmTab } from '../components/CrmTab';
import { ProgramadosContacto } from '../components/ProgramadosContacto';
import { ProyectosVinculados } from '../components/ProyectosVinculados';
import { RadarPanel } from '@/lib/plugins/radar/ui/RadarPanel';
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
  fmtHora,
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

type Props = {
  chatId: number;
  onClose?: () => void;
  /** Sección con la que abrir. `chat` es lo que usa el botón de las listas. */
  seccionInicial?: string | null;
};

type Seccion = 'resumen' | 'chat' | 'ia' | 'crm' | 'acciones' | 'radar' | 'versiones' | 'historial';

/**
 * Ficha del contacto, en el panel derecho del Command Center.
 *
 * Rediseñada con el patrón de Tareas OS: encabezado compacto con lo que
 * identifica al contacto y su estado, riel de iconos para las secciones, y una
 * sola columna de contenido que ocupa todo el alto. Antes eran nueve pestañas
 * de texto en una tira con flechas —en 440 px entraban tres— y el encabezado se
 * comía cuatro renglones antes de que empezara lo importante.
 */
export function FichaView({ chatId, seccionInicial }: Props) {
  const { data, error, isLoading, mutate } = useSWR<Payload>(`${SALES_OPS_API}/contacts/${chatId}`, fetcher);
  const [seccion, setSeccion] = useState<Seccion>(seccionInicial === 'chat' ? 'chat' : 'resumen');

  if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;
  if (isLoading || !data) return <FichaSkeleton />;

  const a = data.analysis;
  const h = data.header;

  const secciones: Array<DockItem<Seccion>> = [
    { id: 'resumen', label: 'Resumen', icon: Sparkles },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'ia', label: 'IA', icon: Wand2 },
    { id: 'crm', label: 'CRM', icon: UserSquare2 },
    { id: 'acciones', label: 'Acciones', icon: ListChecks, badge: data.actions.length },
    { id: 'radar', label: 'Radar', icon: RadarIcon, badge: data.signals.length },
    { id: 'versiones', label: 'Versiones', icon: GitBranch, badge: data.versions.length },
    { id: 'historial', label: 'Historial', icon: History },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Encabezado: quién es y en qué estado está, en dos renglones. El gate
          estaba enterrado dentro del Resumen; acá se ve sin abrir nada. */}
      <header className="flex items-center gap-2.5 pb-3">
        <Avatar className="size-10 shrink-0">
          {h.avatarUrl && <AvatarImage src={h.avatarUrl} alt="" />}
          <AvatarFallback>{iniciales(h.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">{h.name}</h2>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {a && <GateBadge gate={a.currentGate} className="text-[10px]" />}
            <span className="truncate">{h.phoneMasked}</span>
            {a?.firstContactAt && <span className="truncate">· entró {fmtDate(a.firstContactAt)} por {humanize(a.source).toLowerCase()}</span>}
          </p>
        </div>
      </header>

      {/* Sin marco: el panel ya es un contenedor con su propio borde, y la caja
          redondeada de adentro le sacaba ancho a la única columna que hay. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FichaDock items={secciones} active={seccion} onChange={setSeccion} className="rounded-lg border-b-0 bg-muted/40" />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto py-3">
          {seccion === 'resumen' &&
            (a ? (
              <Resumen a={a} header={h} timeline={data.timeline} chatHref={data.chatHref} signals={data.signals} onOverride={() => void mutate()} onIrACrm={() => setSeccion('crm')} />
            ) : (
              <SinAnalisis chatId={chatId} header={h} timeline={data.timeline} chatHref={data.chatHref} signals={data.signals} onOverride={() => void mutate()} />
            ))}
          {seccion === 'chat' && <FichaChat chatId={chatId} chatHref={data.chatHref} className="flex min-h-[60vh] flex-col" />}
          {/* IA: el mismo hilo de burbujas del Resumen pero completo — todos los
              pedidos del contacto, los del conector y los que corrió la IA del
              equipo, sin recortar por análisis. */}
          {seccion === 'ia' && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <PromptConector chatId={chatId} desde={null} variante="completa" />
            </div>
          )}
          {seccion === 'crm' && <CrmTab chatId={chatId} header={h} timeline={data.timeline} onSaved={() => void mutate()} />}
          {seccion === 'acciones' && <Acciones actions={data.actions} />}
          {seccion === 'radar' && <RadarSeccion header={h} signals={data.signals} onRefrescar={() => void mutate()} />}
          {seccion === 'versiones' && <Versiones versions={data.versions} />}
          {seccion === 'historial' && <Historial chatId={chatId} />}
        </div>
      </div>
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

type AccionRapida = 'chat' | 'crm' | 'prompt' | 'historial';

const ACCIONES_RAPIDAS: Array<{ id: AccionRapida; label: string; icon: typeof MessageSquare; titulo: string; descripcion: string }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, titulo: 'Chat', descripcion: 'La conversación en miniatura: leer y contestar sin perder la ficha de vista.' },
  { id: 'crm', label: 'CRM', icon: UserSquare2, titulo: 'CRM del contacto', descripcion: 'Etapa, etiquetas, campos y notas. Se guarda sólo lo que cambies.' },
  { id: 'prompt', label: 'Prompt', icon: Wand2, titulo: 'Prompts al conector', descripcion: 'Dejale una indicación al conector sobre este chat.' },
  { id: 'historial', label: 'Historial', icon: History, titulo: 'Historial del contacto', descripcion: 'Todo lo que se le hizo, con quién y cuándo.' },
];

/**
 * Acciones rápidas del Resumen.
 *
 * Cada una de estas cosas ya vivía en su pestaña, y ahí sigue: el problema era
 * que mirar el CRM o contestar un mensaje mientras se lee el análisis obligaba
 * a cambiar de pestaña y volver, perdiendo el lugar donde uno estaba leyendo.
 * Acá se abren en modal encima del Resumen — se edita, se cierra, y el análisis
 * quedó donde estaba.
 *
 * Son las mismas piezas que dibujan las pestañas, no copias: lo que se guarda
 * en el modal es lo mismo que se guarda en la sección.
 */
function AccionesRapidas({
  chatId,
  header,
  chatHref,
  timeline,
  desdeAnalisis,
  onCambio,
}: {
  chatId: number;
  header: Header;
  chatHref: string;
  timeline: DetailPayload['timeline'];
  desdeAnalisis: string | null;
  onCambio: () => void;
}) {
  const [abierta, setAbierta] = useState<AccionRapida | null>(null);
  const actual = ACCIONES_RAPIDAS.find((x) => x.id === abierta) ?? null;

  /**
   * Cuántos pedidos distintos hay para este chat desde el último análisis.
   *
   * Es la misma clave SWR que usa `PromptConector`, así que no agrega una
   * llamada: sin el número, la persona tendría que abrir el modal para
   * enterarse de que le dejó un pedido al conector y todavía no volvió.
   */
  const { data: prompts } = useSWR<{ runs: PromptRun[] }>(`${SALES_OPS_API}/prompts/queue?chatId=${chatId}&status=all`, fetcher, { refreshInterval: 30_000 });
  const pedidos = useMemo(() => {
    const todas = prompts?.runs ?? [];
    const visibles = desdeAnalisis ? todas.filter((r) => r.createdAt >= desdeAnalisis) : todas;
    return new Set(visibles.map((r) => r.text.trim())).size;
  }, [prompts?.runs, desdeAnalisis]);

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {ACCIONES_RAPIDAS.map(({ id, label, icon: Icon, descripcion }) => (
          <button
            key={id}
            type="button"
            title={descripcion}
            onClick={() => setAbierta(id)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
            {id === 'prompt' && pedidos > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">{pedidos}</span>
            )}
          </button>
        ))}
      </div>

      {actual && (
        <ResponsiveModal
          open
          onOpenChange={(abierto) => !abierto && setAbierta(null)}
          title={`${actual.titulo} · ${header.name}`}
          description={actual.descripcion}
        >
          {actual.id === 'chat' && <FichaChat chatId={chatId} chatHref={chatHref} className="flex h-[58vh] flex-col" />}
          {actual.id === 'crm' && <CrmTab chatId={chatId} header={header} timeline={timeline} onSaved={onCambio} />}
          {actual.id === 'prompt' && <PromptConector chatId={chatId} desde={desdeAnalisis} />}
          {actual.id === 'historial' && <Historial chatId={chatId} />}
        </ResponsiveModal>
      )}
    </>
  );
}

function Resumen({
  a,
  header,
  timeline,
  chatHref,
  signals,
  onOverride,
  onIrACrm,
}: {
  a: AnalysisDetail;
  header: Header;
  timeline: DetailPayload['timeline'];
  chatHref: string;
  signals: SignalRow[];
  onOverride: () => void;
  /** Salta a la pestaña CRM. Sin esto, la corrección a mano no se ofrece. */
  onIrACrm?: () => void;
}) {
  const chatName = header.name;
  const analyzedText = a.analyzedAt ? `analizado ${tiempoRelativo(a.analyzedAt)}${a.analyzedBy ? ` por ${humanize(a.analyzedBy)}` : ''}` : 'sin analizar';
  const ejes = ejesDeAnalisis(a);
  return (
    <div className="space-y-4">
      <AccionesRapidas
        chatId={a.chatId}
        header={header}
        chatHref={chatHref}
        timeline={timeline}
        desdeAnalisis={a.analyzedAt}
        onCambio={onOverride}
      />

      {/* El perfil del contacto de un vistazo. Los seis números ya estaban en
          la ficha, pero enterrados en el desplegable de "todos los datos": ahí
          nadie los comparaba entre contactos, que es justamente para lo que
          sirven. */}
      <section className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-border p-3 sm:flex-nowrap">
        <ScoreRadar ejes={ejes} size={168} className="shrink-0" />
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2">
          {ejes.map((eje) => (
            <div key={eje.label} className="min-w-0">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{eje.label}</dt>
              <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{eje.crudo}</dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Valor</dt>
            <dd className="truncate text-sm font-semibold tabular-nums text-foreground">USD {fmtInt(a.potentialValueUsd)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Impactos</dt>
            <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{a.followupsTotal}</dd>
          </div>
        </dl>
      </section>

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

      <SiguienteAccion
        chatId={a.chatId}
        chatName={chatName}
        recommendedAction={a.recommendedAction}
        ownerLabel={OWNER_LABELS[a.recommendedOwner] ?? a.recommendedOwner}
        statusLabel={STATUS_LABELS[a.status] ?? a.status}
        onLaunched={onOverride}
      />

      <div className="flex flex-wrap gap-1.5">
        <AccionesManuales chatId={a.chatId} nombre={chatName} />
        <AccionesDeGate chatId={a.chatId} currentGate={a.currentGate} currentStatus={a.status} onDone={onOverride} />
      </div>

      {/* Lo que ya le va a llegar sin que nadie haga nada. Sólo aparece si tiene
          alguno: escribirle encima de un programado es el error caro. */}
      <ProgramadosContacto
        remoteJid={header.remoteJid ?? null}
        nombre={chatName}
        chatId={a.chatId}
        soloSiHay
        inicialAbierto
        onCambio={onOverride}
      />

      <section className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <PromptConector chatId={a.chatId} desde={a.analyzedAt} />
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

      {/* 18 datos derivados: informan, no se accionan. Plegados por defecto para
          que lo que sí se acciona (siguiente acción, notas, timeline) entre en pantalla. */}
      <details className="group rounded-xl border border-border">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
          Todos los datos del análisis
        </summary>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border p-3 sm:grid-cols-3">
        <Field label="Necesidad">
          {humanize(a.need)}
          {a.needDetail && <span className="block text-xs text-muted-foreground">{a.needDetail}</span>}
        </Field>
        <Field label="Precio conocido">{a.quotedPrice ? fmtMoney(a.quotedPrice.amount, a.quotedPrice.currency) : '—'}</Field>
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
        {/* Mismo criterio que la lista y que el Focus: el análisis puede estar
            viejo, pero si hay ficha resuelta es cliente igual. */}
        <Field label="Cliente">
          <span title={a.isExistingCustomer || a.customerId ? tituloCliente(a.cliente?.fuente) : undefined}>
            {a.isExistingCustomer || a.customerId ? 'sí' : 'no'}
          </span>{' '}
          <span className="text-muted-foreground">
            ({a.cliente?.fuente ? tituloCliente(a.cliente.fuente).toLowerCase() : `evidencia: ${a.customerEvidence}`})
          </span>
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
      </details>

      {(a.evidenceGap || a.autoReplyDetected) && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {a.evidenceGap && 'Hay audios sin transcribir u otro hueco de evidencia. '}
          {a.autoReplyDetected && 'Este contacto tiene respuestas automáticas.'}
        </p>
      )}


      {a.notesForHuman && (
        <dl className="space-y-3">
          <Field label="Notas para el humano">{a.notesForHuman}</Field>
        </dl>
      )}

      <CrmFixCard chatId={a.chatId} texto={a.crmToFix} fix={a.crmFix} onAplicado={onOverride} onEditar={onIrACrm} />

      <ProyectosVinculados chatId={a.chatId} />

      {signals.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <RadarIcon className="size-3.5" aria-hidden />
            Señales sin atender
          </h3>
          <Radar signals={signals} onRefrescar={onOverride} />
        </section>
      )}

      <RadarDelCliente header={header} />

      {/* El timeline era una pestaña y por eso se leía como "otra vista". Es el
          respaldo de todo lo de arriba: va acá, después de las notas, donde uno
          termina de leer y quiere ver de dónde salió cada cosa. */}
      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
        <Timeline items={timeline} chatHref={chatHref} signals={signals} />
      </section>
    </div>
  );
}

/**
 * Radar del cliente dentro del Resumen.
 *
 * Es el análisis acumulado del contacto (los campos `radar_*`), y hasta ahora
 * había que ir a la pestaña Radar y elegir la segunda solapa para verlo: dos
 * clics que nadie hacía mientras leía el análisis, que es justo cuando sirve.
 * Se reusa el mismo `RadarPanel` del plugin, no una copia.
 *
 * Se dibuja abierto y se puede plegar desde el título (o con el botón "volver"
 * del propio panel) cuando estorba.
 */
function RadarDelCliente({ header }: { header: Header }) {
  // Abierto de entrada: es parte de lo que se viene a leer, no un anexo.
  const [abierto, setAbierto] = useState(true);

  if (!header.contactId) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', abierto && 'rotate-180')} aria-hidden />
        <RadarIcon className="size-3.5" aria-hidden />
        Radar del cliente
      </button>
      {abierto && (
        <div className="overflow-hidden rounded-xl border border-border">
          <RadarPanel
            contactId={header.contactId}
            chatId={header.chatId}
            contactName={header.name}
            remoteJid={header.remoteJid}
            onBack={() => setAbierto(false)}
            onUseSuggestion={(texto) => {
              void navigator.clipboard.writeText(texto).then(
                () => toast.success('Sugerencia copiada. Pegala en el chat.'),
                () => toast.error('No se pudo copiar.'),
              );
            }}
          />
        </div>
      )}
    </section>
  );
}

function SinAnalisis({
  chatId,
  header,
  timeline,
  chatHref,
  signals,
  onOverride,
}: {
  chatId: number;
  header: Header;
  timeline: DetailPayload['timeline'];
  chatHref: string;
  signals: SignalRow[];
  onOverride: () => void;
}) {
  const chatName = header.name;
  return (
    <div className="space-y-4">
      <AccionesRapidas chatId={chatId} header={header} chatHref={chatHref} timeline={timeline} desdeAnalisis={null} onCambio={onOverride} />

      <div className="space-y-3 rounded-xl border border-dashed border-border p-4 text-center">
        <p className="text-sm font-medium">Este chat todavía no fue analizado</p>
        <p className="text-xs text-muted-foreground">Podés fijar un gate a mano, o pedirle sugerencias a la IA leyendo el historial de abajo.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <AccionesDeGate chatId={chatId} currentGate={null} currentStatus={null} onDone={onOverride} />
          <AccionesManuales chatId={chatId} nombre={chatName} />
        </div>
      </div>

      <SiguienteAccion chatId={chatId} chatName={chatName} recommendedAction="Todavía sin analizar" onLaunched={onOverride} />

      <ProgramadosContacto
        remoteJid={header.remoteJid ?? null}
        nombre={chatName}
        chatId={chatId}
        soloSiHay
        inicialAbierto
        onCambio={onOverride}
      />

      <section className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <PromptConector chatId={chatId} desde={null} />
      </section>

      <ProyectosVinculados chatId={chatId} />

      <RadarDelCliente header={header} />

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
        <Timeline items={timeline} chatHref={chatHref} signals={signals} />
      </section>
    </div>
  );
}

/**
 * Los tres botones que decían "Fase 6".
 *
 * Ahora proponen de verdad: arman un lote de un contacto que entra a la Cola
 * con las mismas exclusiones y la misma aprobación que un lote masivo. Siguen
 * sin enviar nada por sí solos — eso pasa recién al aprobar y ejecutar.
 */
function AccionesManuales({ chatId, nombre }: { chatId: number; nombre: string }) {
  const [abierto, setAbierto] = useState<ActionKind | null>(null);
  const opciones: Array<{ kind: ActionKind; label: string }> = [
    { kind: 'send_message', label: 'Proponer envío' },
    { kind: 'create_task', label: 'Crear tarea' },
    { kind: 'register_sale', label: 'Registrar cobro' },
  ];
  return (
    <>
      {opciones.map(({ kind, label }) => (
        <Button key={kind} size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAbierto(kind)}>
          {label}
        </Button>
      ))}
      {abierto && (
        <ProponerAccionDialog
          chatId={chatId}
          nombre={nombre}
          kind={abierto}
          open
          onOpenChange={(o) => !o && setAbierto(null)}
        />
      )}
    </>
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

// ── Pestañas Notas y Campos ─────────────────────────────────────────────────

// ── Dejar un prompt al conector (entra a la cola de ejecución) ──────────────

/**
 * Prompts al conector, en línea y acumulados.
 *
 * Era un botón que abría un diálogo: escribías uno, se cerraba y no quedaba
 * rastro de lo que ya habías pedido, así que no se sabía si el conector lo
 * había corrido ni qué había contestado. Ahora es una caja de chat con el hilo
 * arriba — lo que mandaste, en qué estado está y el resumen que devolvió.
 *
 * El hilo arranca en la última clasificación (`desde`): cada análisis nuevo
 * deja el pizarrón limpio, porque las indicaciones viejas se escribieron contra
 * una foto del chat que ya no es la actual. Las corridas siguen en la cola —
 * esto es lo que se muestra, no se borra nada.
 */
type PromptRun = {
  id: number;
  /** `manual` = lo escribió una persona en esta caja; el resto son skills y corridas del motor. */
  promptKey: string;
  title: string;
  text: string;
  status: string;
  connector: string;
  /** `api` = lo corrió la IA del equipo en el momento; `queue` = espera conector. */
  mode?: 'api' | 'queue';
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
};

const RUN_LABELS: Record<string, string> = {
  queued: 'En cola',
  running: 'Ejecutando',
  completed: 'Listo',
  failed: 'Falló',
  cancelled: 'Cancelado',
};

/**
 * @param variante `compacta` es la del Resumen: hilo acotado y sin las corridas
 * que ya corrió la IA del equipo por API —esas quedan auditadas en Historial y
 * repetirlas acá llenaba media ficha con texto que nadie vuelve a leer—.
 * `completa` es la sección IA: todo, sin recortes.
 */
function PromptConector({
  chatId,
  desde,
  variante = 'compacta',
}: {
  chatId: number;
  desde: string | null;
  variante?: 'compacta' | 'completa';
}) {
  const { data, mutate } = useSWR<{ runs: PromptRun[] }>(
    `${SALES_OPS_API}/prompts/queue?chatId=${chatId}&status=all`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * El hilo es sólo para lo que escribió una persona. Las corridas del motor
   * (clasificación, radar) y las skills traen un prompt de media página y una
   * respuesta con JSON: metidas en el hilo tapaban los pedidos reales y se
   * leían como si alguien los hubiera escrito. Van aparte, plegadas, en
   * `automaticas`.
   */
  const { runs, automaticas } = useMemo(() => {
    const todas = data?.runs ?? [];
    const desdeAnalisis = desde ? todas.filter((r) => r.createdAt >= desde) : todas;
    // En el Resumen sólo lo que está en manos de un conector: lo que ya
    // contestó la IA del equipo vive en Historial y en la sección IA.
    const visibles = variante === 'compacta' ? desdeAnalisis.filter((r) => r.mode !== 'api') : desdeAnalisis;
    const ordenadas = [...visibles].sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1));
    return {
      runs: ordenadas.filter((r) => r.promptKey === 'manual'),
      automaticas: ordenadas.filter((r) => r.promptKey !== 'manual').reverse(),
    };
  }, [data?.runs, desde, variante]);

  /**
   * El hilo, de lo más viejo a lo más nuevo, con el mismo pedido repetido
   * colapsado en una sola burbuja.
   *
   * Lanzar tres veces "resumime el chat" deja tres corridas idénticas, y el hilo
   * se leía como tres pedidos distintos: tres párrafos iguales ocupando la ficha
   * entera. Se colapsan sólo las **consecutivas** —si en el medio se pidió otra
   * cosa, la repetición vuelve a ser un pedido nuevo, porque ahí sí es una
   * insistencia y no un doble clic. Nada se borra: las corridas siguen enteras
   * en la Cola.
   */
  const hilo = useMemo(() => {
    const grupos: Array<{ run: PromptRun; veces: number }> = [];
    for (const run of runs) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.run.text.trim() === run.text.trim()) {
        // Se queda el más nuevo: es el que tiene el estado y la respuesta buenas.
        grupos[grupos.length - 1] = { run, veces: ultimo.veces + 1 };
      } else {
        grupos.push({ run, veces: 1 });
      }
    }
    return grupos;
  }, [runs]);

  const enviar = async () => {
    const limpio = text.trim();
    if (limpio.length < 5) {
      toast.error('Escribí qué tiene que hacer el conector (mínimo 5 caracteres).');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${SALES_OPS_API}/prompts/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: limpio, targetKind: 'chat', targetId: chatId }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(body?.error ?? `Error ${r.status}`));
      setText('');
      // El chat pasó a tener algo en cola: sale solo de "Pendiente de verificación".
      avisarEncolado(chatId);
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {hilo.length > 0
          ? `${hilo.length} pedido${hilo.length === 1 ? '' : 's'}${desde ? ' desde el último análisis' : ''}`
          : desde
            ? 'Sin pedidos desde el último análisis'
            : 'Sin pedidos todavía'}
      </p>

      {/* Hilo de burbujas: lo que le pedimos al conector sale a la derecha (es
          nuestro mensaje) y lo que contestó, a la izquierda. Es la misma forma
          que el chat de al lado, así que se lee sin aprender nada nuevo. */}
      {hilo.length > 0 && (
        <ul className={cn('space-y-2 overflow-y-auto pr-0.5', variante === 'compacta' ? 'max-h-72' : 'max-h-[60vh]')}>
          {hilo.map(({ run, veces }) => {
            const pendiente = run.status === 'queued' || run.status === 'running';
            return (
              <li key={run.id} className="space-y-1">
                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2">
                    <p className="whitespace-pre-wrap text-xs leading-snug text-foreground">{run.text}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                      {veces > 1 && <span className="font-semibold tabular-nums">×{veces}</span>}
                      <span>{fmtHora(run.createdAt)}</span>
                      <span className="rounded bg-background/70 px-1 font-semibold uppercase">{RUN_LABELS[run.status] ?? run.status}</span>
                    </p>
                  </div>
                </div>

                {run.status === 'failed' && run.summary ? (
                  <div className="flex justify-start">
                    <FallaCorrida run={run} className="max-w-[88%]" onRetried={() => void mutate()} />
                  </div>
                ) : run.summary ? (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                      {run.connector && run.connector !== 'any' && (
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{run.connector}</p>
                      )}
                      <p className="whitespace-pre-wrap text-xs leading-snug text-foreground/90">{run.summary}</p>
                      <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{fmtHora(run.completedAt ?? run.createdAt)}</p>
                    </div>
                  </div>
                ) : pendiente ? (
                  <div className="flex justify-start">
                    <span className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      esperando al conector…
                    </span>
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setText(run.text)}
                    className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Repetir este pedido
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace salto: es una caja de chat.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={2}
          placeholder="Pedile algo al conector sobre este chat. Ej.: redactá el mensaje para pedir la seña, no lo envíes."
          className="min-h-[52px] resize-none text-xs"
        />
        <Button type="button" size="icon" className="size-9 shrink-0" disabled={busy || text.trim().length < 5} onClick={() => void enviar()} aria-label="Enviar al conector">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Lo ejecuta Claude, ChatGPT o Grok con el prompt P9 (vista Cola).
        {variante === 'compacta' && ' Lo que corre la IA del equipo queda en Historial.'}
      </p>

      {variante === 'completa' && automaticas.length > 0 && <CorridasAutomaticas runs={automaticas} />}
    </div>
  );
}


/**
 * Skills y corridas del motor sobre este chat, plegadas.
 *
 * Es lo que antes ocupaba el hilo: título, estado y hora en una línea, y el
 * texto completo (prompt y respuesta) sólo si alguien lo abre. La respuesta
 * suele ser JSON del clasificador: se muestra en monoespaciado y chico, que es
 * como se lee, no como una burbuja de chat.
 */
function CorridasAutomaticas({ runs }: { runs: PromptRun[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <details className="group rounded-xl border border-border/60 bg-background/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Skills y corridas automáticas · {runs.length}
      </summary>
      <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-border/60 p-2">
        {runs.map((run) => {
          const abierto = abierta === run.id;
          return (
            <li key={run.id} className="rounded-lg border border-border/60 bg-card px-2.5 py-1.5">
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setAbierta(abierto ? null : run.id)}>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{run.title}</span>
                {run.connector && !['any', 'pending', 'server'].includes(run.connector) && (
                  <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{run.connector}</span>
                )}
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold uppercase text-muted-foreground">{RUN_LABELS[run.status] ?? run.status}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtHora(run.completedAt ?? run.createdAt)}</span>
              </button>
              {abierto && (
                <div className="mt-1.5 space-y-1.5">
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">{run.text}</pre>
                  {run.summary && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[10px] leading-relaxed text-foreground/90">{run.summary}</pre>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

// ── Override manual ────────────────────────────────────────────────────────

/**
 * A qué lista pertenece un contacto lo decide su gate y su estado (mismo
 * criterio que `vistaWhere` en el servidor), no un campo aparte. Mover a
 * "Limpieza" es marcarle el estado de descarte; mover a "Dinero" es subirle el
 * gate. Por eso esto no es un campo editable: es un preset del override, y la
 * persona confirma gate, destino y motivo antes de que se escriba nada.
 */
const LISTAS: Array<{ key: string; label: string; gates: Gate[]; gate: Gate; status: AnalysisStatus | null }> = [
  { key: 'dinero', label: 'Dinero', gates: ['G8', 'G9', 'G10'], gate: 'G9', status: null },
  { key: 'oportunidades', label: 'Oportunidades', gates: ['G4', 'G5', 'G6', 'G7'], gate: 'G7', status: null },
  { key: 'barrido', label: 'Barrido', gates: ['G0', 'G1', 'G2', 'G3'], gate: 'G2', status: null },
  { key: 'limpieza', label: 'Limpieza', gates: ['GX'], gate: 'GX', status: 'pre_descarte' },
];

type PresetOverride = { gate: Gate; status: AnalysisStatus; reason: string; titulo: string };

function AccionesDeGate({
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
  const [preset, setPreset] = useState<PresetOverride | null>(null);

  const moverA = (lista: (typeof LISTAS)[number]) => {
    // Si el gate actual ya pertenece a la lista destino no se toca: mover de
    // lista no debería reescribir un gate que la IA acertó.
    const gate = currentGate && lista.gates.includes(currentGate) ? currentGate : lista.gate;
    setPreset({
      gate,
      status: lista.status ?? currentStatus ?? 'en_proceso',
      reason: `Movido a mano a ${lista.label}`,
      titulo: `Mover a ${lista.label}`,
    });
  };

  return (
    <>
      <ClasificarAhoraButton chatId={chatId} onDone={onDone} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 text-xs">
            Mover a lista
            <ChevronDown className="ml-1 size-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {LISTAS.map((lista) => (
            <DropdownMenuItem key={lista.key} onSelect={() => moverA(lista)}>
              {lista.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="ghost"
        className="h-8 text-xs"
        onClick={() =>
          setPreset({
            gate: currentGate ?? 'G0',
            status: currentStatus ?? 'recuperado',
            reason: '',
            titulo: 'Cambiar gate manualmente',
          })
        }
      >
        Cambiar gate manualmente
      </Button>

      <OverrideDialog chatId={chatId} preset={preset} onClose={() => setPreset(null)} onDone={onDone} />
    </>
  );
}

function OverrideDialog({
  chatId,
  preset,
  onClose,
  onDone,
}: {
  chatId: number;
  /** null = cerrado. Trae los valores con los que abre el formulario. */
  preset: PresetOverride | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [gate, setGate] = useState<Gate>('G0');
  const [status, setStatus] = useState<AnalysisStatus>('recuperado');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Cada vez que se abre (o cambia el preset) el formulario arranca de cero con
  // los valores del destino elegido.
  useEffect(() => {
    if (!preset) return;
    setGate(preset.gate);
    setStatus(preset.status);
    setReason(preset.reason);
  }, [preset]);

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
      onClose();
      onDone();
    } catch {
      toast.error('No se pudo conectar con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={preset !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{preset?.titulo ?? 'Cambiar gate manualmente'}</DialogTitle>
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
                  {ANALYSIS_STATUSES.map((sts) => (
                    <SelectItem key={sts} value={sts}>{STATUS_LABELS[sts]}</SelectItem>
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
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
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

function Acciones({ actions }: { actions: ActionRow[] }) {
  if (actions.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin acciones todavía. Las señales del radar están en la pestaña Radar.</p>;
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
    </div>
  );
}

/**
 * Radar del contacto: lo que el barrido detectó en sus mensajes.
 *
 * Vivía apretado al final de Acciones, que es otra cosa (lo que NOSOTROS le
 * propusimos hacer). Separado tiene lugar para lo que hace falta al mirar una
 * ficha: qué dijo, cuándo, y poder darlo por atendido sin volver a la bandeja.
 */
function Radar({ signals, onRefrescar }: { signals: SignalRow[]; onRefrescar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const pendientes = signals.filter((s) => s.status === 'new' || s.status === 'seen');

  const atender = async (ids: number[]) => {
    if (!ids.length) return;
    setOcupado(true);
    try {
      const res = await fetch(`${SALES_OPS_API}/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark', signalIds: ids, status: 'handled' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo marcar');
      toast.success(ids.length > 1 ? `Atendidas ${ids.length} señales` : 'Señal atendida');
      onRefrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo marcar');
    } finally {
      setOcupado(false);
    }
  };

  if (signals.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">El radar todavía no detectó nada en este chat.</p>;
  }

  return (
    <div className="space-y-2">
      {pendientes.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {pendientes.length} sin atender de {signals.length}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={ocupado} onClick={() => void atender(pendientes.map((s) => s.id))}>
            {ocupado ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            Atender todas ({pendientes.length})
          </Button>
        </div>
      )}
      <ul className="divide-y divide-border/60 rounded-xl border border-border">
        {signals.map((s) => {
          const meta = KIND_META[s.kind];
          const pendiente = s.status === 'new' || s.status === 'seen';
          return (
            <li key={s.id} className={cn('space-y-1 px-3 py-2', meta?.urgent && pendiente && 'bg-primary/5')}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <span aria-hidden>{meta?.emoji ?? '•'}</span>
                  <span className="truncate">{SIGNAL_LABELS[s.kind] ?? s.kind}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {tiempoRelativo(s.createdAt)} · {s.confidence}%
                  {s.gateBefore && s.gateAfter && <> · {s.gateBefore}→{s.gateAfter}</>}
                </span>
              </div>
              {s.excerpt && <p className="line-clamp-2 text-xs text-muted-foreground">&ldquo;{s.excerpt}&rdquo;</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {pendiente ? 'Sin atender' : `${s.status}${s.handledAt ? ` · ${fmtDateTime(s.handledAt)}` : ''}`}
                </span>
                {pendiente && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={ocupado} onClick={() => void atender([s.id])}>
                    Atendida
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Historial del contacto: qué pasó, cuándo y quién. Sale de `activity_logs`
 * (prefijo `SALES_OPS_`), que es donde ya quedaba registrado cada
 * clasificación, override, señal atendida y prompt.
 *
 * Era una lista plana donde cada fila repetía el mismo relojito gris y la fecha
 * completa, y los eventos sin etiqueta salían con el nombre crudo de la
 * constante (`skill_saved`). Ahora se agrupa por día —que es como uno recuerda
 * las cosas: "esto fue ayer"—, cada familia tiene su ícono, y la hora sola
 * alcanza porque el día está en el encabezado del grupo.
 */
function Historial({ chatId }: { chatId: number }) {
  const { data, error, isLoading, mutate } = useSWR<HistoryPayload>(`${SALES_OPS_API}/contacts/${chatId}/history`, fetcher);

  const porDia = useMemo(() => {
    const grupos = new Map<string, HistoryEntry[]>();
    for (const entry of data?.entries ?? []) {
      const dia = entry.at.slice(0, 10);
      const lista = grupos.get(dia);
      if (lista) lista.push(entry);
      else grupos.set(dia, [entry]);
    }
    return [...grupos.entries()];
  }, [data?.entries]);

  if (error) return <ErrorState message={String(error.message ?? error)} onRetry={() => void mutate()} />;
  if (isLoading && !data) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Cargando historial…</p>;
  }
  if (porDia.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no se hizo nada sobre este contacto.</p>;
  }

  return (
    <div className="space-y-4">
      {porDia.map(([dia, entradas]) => (
        <section key={dia} className="space-y-1.5">
          <h3 className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            {fmtDate(entradas[0].at)}
          </h3>
          <ul className="space-y-1">
            {entradas.map((entry) => {
              const Icon = HISTORIAL_ICONOS[entry.kind] ?? History;
              return (
                <li key={entry.id} className="flex gap-2.5 rounded-lg border border-border/60 bg-card px-2.5 py-2">
                  <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md', HISTORIAL_TONOS[entry.kind] ?? HISTORIAL_TONOS.otro)}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-sm font-medium leading-snug text-foreground">{entry.label}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{fmtHora(entry.at)}</span>
                    </div>
                    {entry.detail && <p className="text-xs leading-snug text-muted-foreground">{entry.detail}</p>}
                    <p className="text-[11px] text-muted-foreground/80">
                      {/* Sin persona = lo hizo el cron o un conector; decirlo evita
                          que alguien busque quién fue. */}
                      {entry.by ?? 'automático'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Sección Radar de la ficha: las señales del Command Center y el radar del
 * cliente, en el mismo lugar.
 *
 * Son dos radares distintos que el equipo usa para lo mismo. Las **señales**
 * son lo que el cliente acaba de responder (pago, objeción, quiere llamada);
 * el **radar del cliente** es el análisis acumulado que vive en los campos
 * `radar_*` y que hasta ahora sólo se veía apretando "Radar" dentro del chat de
 * WhatsPro. Tener que saltar entre dos pantallas para mirar al mismo contacto
 * era lo que hacía que una de las dos no se mirara nunca.
 *
 * Se reusa el `RadarPanel` del plugin tal cual, no una copia: si el radar
 * cambia, esto cambia con él.
 */
function RadarSeccion({ header, signals, onRefrescar }: { header: Header; signals: SignalRow[]; onRefrescar: () => void }) {
  const [cara, setCara] = useState<'senales' | 'cliente'>('senales');

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {([
          { id: 'senales' as const, label: `Señales${signals.length ? ` (${signals.length})` : ''}` },
          { id: 'cliente' as const, label: 'Radar del cliente' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setCara(id)}
            aria-pressed={cara === id}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              cara === id ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {cara === 'senales' ? (
        <Radar signals={signals} onRefrescar={onRefrescar} />
      ) : header.contactId ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <RadarPanel
            contactId={header.contactId}
            chatId={header.chatId}
            contactName={header.name}
            remoteJid={header.remoteJid}
            onBack={() => setCara('senales')}
            onUseSuggestion={(texto) => {
              void navigator.clipboard.writeText(texto).then(
                () => toast.success('Sugerencia copiada. Pegala en el chat.'),
                () => toast.error('No se pudo copiar.'),
              );
            }}
          />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Este chat todavía no tiene ficha de contacto, así que no hay radar del cliente.
        </p>
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
