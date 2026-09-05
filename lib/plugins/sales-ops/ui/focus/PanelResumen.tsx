'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ChevronRight, Clock, Coins, Flame, Radar as RadarIcon, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DetailPayload, TimelineGap, TimelineHit } from '../../shared/api-types';
import type { SignalKind } from '../../shared/taxonomy';
import { toast } from 'sonner';
import { RadarPanel } from '@/lib/plugins/radar/ui/RadarPanel';
import { GateBadge } from '../components/GateBadge';
import { ProgramadosContacto } from '../components/ProgramadosContacto';
import { ScoreRadar, ejesDeAnalisis } from '../components/ScoreRadar';
import { ErrorState, LoadingRows } from '../components/States';
import { ACTION_KIND_LABELS, ACTION_STATUS_LABELS, OWNER_LABELS, SIGNAL_LABELS, STATUS_LABELS, SALES_OPS_API, WHO_LABELS, diasTexto, fetcher, fmtDate, fmtInt, fmtMoney, fmtPct, humanize, tiempoRelativo } from '../components/format';

/**
 * Columna izquierda del Focus: quién es este cliente, en una pantalla sin
 * scroll si se puede.
 *
 * Todo sale de `GET /contacts/{chatId}`, que ya existía para la ficha: el Focus
 * no agregó ni un endpoint para esto. Lo que cambió es el recorte — de los 40
 * campos del análisis quedan los seis que hacen falta para decidir qué hacer en
 * los próximos treinta segundos.
 */
type DetalleConCabecera = DetailPayload & { header?: { remoteJid: string; contactId: number | null } | null };

export function PanelResumen({ chatId, className }: { chatId: number; className?: string }) {
  const { data, error, isLoading, mutate } = useSWR<DetalleConCabecera>(`${SALES_OPS_API}/contacts/${chatId}`, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: false,
  });

  if (error) return <ErrorState className={className} message={error instanceof Error ? error.message : undefined} onRetry={() => void mutate()} />;
  if (isLoading || !data) return <LoadingRows rows={5} className={className} />;

  const a = data.analysis;
  if (!a) {
    return (
      <div className={cn('rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground', className)}>
        Este chat todavía no está auditado. Dejalo para el conector y lo clasifica.
      </div>
    );
  }

  const sinAtender = data.signals.filter((s) => s.status === 'new' || s.status === 'seen');
  const todasLasSenales = data.signals;
  const porTipoDeSenal = Object.entries(
    data.signals.reduce<Record<string, number>>((acc, s) => {
      acc[s.kind] = (acc[s.kind] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((x, y) => y[1] - x[1]);
  const header = data.header;

  return (
    <div className={cn('space-y-3', className)}>
      <section className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight" title={a.name}>{a.name}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{a.phoneMasked}</p>
          </div>
          <GateBadge gate={a.currentGate} />
        </div>

        <p className="mt-2 text-[13px] font-medium leading-snug text-foreground">{a.recommendedAction || 'Sin acción recomendada.'}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {STATUS_LABELS[a.status] ?? humanize(a.status)} · {OWNER_LABELS[a.recommendedOwner] ?? humanize(a.recommendedOwner)}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <div className="flex justify-center text-primary">
          <ScoreRadar ejes={ejesDeAnalisis(a)} size={186} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Dato icon={Coins} label="Valor" valor={`USD ${fmtInt(a.potentialValueUsd)}`} hint={`Cobro ${humanize(a.collectionSpeed)}`} tono={a.paymentPending ? 'emerald' : 'neutro'} />
        <Dato icon={Clock} label="Silencio" valor={diasTexto(a.daysSilent)} hint={a.lastCustomerMessageAt ? `Escribió ${tiempoRelativo(a.lastCustomerMessageAt)}` : 'Nunca escribió'} tono={(a.daysSilent ?? 0) > 30 ? 'ambar' : 'neutro'} />
        <Dato icon={Repeat2} label="Impactos" valor={fmtInt(a.followupsTotal)} hint={a.lastFollowupAt ? `Último ${tiempoRelativo(a.lastFollowupAt)}` : 'Nunca se lo tocó'} tono="neutro" />
        <Dato icon={Flame} label="Objeción" valor={humanize(a.objectionType)} hint={a.objectionDetail ? a.objectionDetail.slice(0, 60) : humanize(a.intent)} tono={a.objectionType !== 'ninguna' ? 'ambar' : 'neutro'} />
      </section>

      {sinAtender.length > 0 && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Señales sin atender</p>
          <ul className="mt-1.5 space-y-1.5">
            {sinAtender.slice(0, 4).map((s) => (
              <li key={s.id} className="text-[11px] leading-snug">
                <span className="font-medium text-foreground">{SIGNAL_LABELS[s.kind] ?? humanize(s.kind)}</span>
                <span className="text-muted-foreground"> · {tiempoRelativo(s.createdAt)}</span>
                {s.excerpt && <span className="mt-0.5 block line-clamp-2 text-muted-foreground/90">“{s.excerpt}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(a.automationActive || a.autoReplyDetected || a.evidenceGap) && (
        <section className="flex flex-wrap gap-1.5">
          {a.automationActive && <Aviso texto="Automatización activa" />}
          {a.autoReplyDetected && <Aviso texto="Respuesta automática" />}
          {a.evidenceGap && <Aviso texto="Sin evidencia suficiente" />}
        </section>
      )}

      {a.notesForHuman && (
        <p className="rounded-xl border border-border bg-card p-3 text-[11px] leading-snug text-muted-foreground">{a.notesForHuman}</p>
      )}

      {/* Lo que le va a salir. `soloSiHay`: si no tiene ninguno no ocupa nada. */}
      {header?.remoteJid && (
        <ProgramadosContacto key={chatId} remoteJid={header.remoteJid} nombre={a.name} chatId={chatId} soloSiHay />
      )}

      {data.actions.length > 0 && (
        <Plegable titulo="Acciones del Command Center" cuantos={data.actions.length}>
          <ul className="space-y-1.5">
            {data.actions.slice(0, 8).map((accion) => (
              <li key={accion.id} className="text-[11px] leading-snug">
                <span className="font-medium text-foreground">{ACTION_KIND_LABELS[accion.kind] ?? humanize(accion.kind)}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {ACTION_STATUS_LABELS[accion.status] ?? humanize(accion.status)}
                  {' · '}
                  {tiempoRelativo(accion.executedAt ?? accion.approvedAt ?? accion.createdAt)}
                </span>
                {typeof accion.payload?.text === 'string' && accion.payload.text.trim() && (
                  <span className="mt-0.5 block line-clamp-2 text-muted-foreground/90">{String(accion.payload.text)}</span>
                )}
              </li>
            ))}
          </ul>
        </Plegable>
      )}

      {/* El mismo RadarPanel del Resumen del Command Center, no una copia: el
          análisis acumulado del contacto con sus solapas, tal cual se ve allá. */}
      {header?.contactId != null && (
        <RadarDelCliente contactId={header.contactId} chatId={chatId} nombre={a.name} remoteJid={header.remoteJid} />
      )}

      {/* Los 20 datos derivados del análisis. Informan, no se accionan, así que
          van plegados: en esta columna compiten con lo que sí se acciona. Dos
          columnas y no tres — acá el ancho es la mitad que en la ficha. */}
      <Plegable titulo="Todos los datos" cuantos={a.version}>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-2">
          <Campo label="Necesidad">
            {humanize(a.need)}
            {a.needDetail && <span className="block text-[10px] text-muted-foreground">{a.needDetail}</span>}
          </Campo>
          <Campo label="Precio conocido">{a.quotedPrice ? fmtMoney(a.quotedPrice.amount / 100, a.quotedPrice.currency) : '—'}</Campo>
          <Campo label="Rubro">{a.businessType || '—'}</Campo>
          <Campo label="Origen">
            {humanize(a.source)}
            {a.sourceDetail && <span className="block text-[10px] text-muted-foreground">{a.sourceDetail}</span>}
          </Campo>
          <Campo label="Objeción">
            {humanize(a.objectionType)}
            {a.objectionDetail && <span className="block text-[10px] text-muted-foreground">{a.objectionDetail}</span>}
          </Campo>
          <Campo label="Intención">
            {humanize(a.intent)} <span className="tabular-nums text-muted-foreground">({a.intentScore})</span>
          </Campo>
          <Campo label="Temperatura">{humanize(a.temperature)}</Campo>
          <Campo label="Probabilidad">{fmtPct(a.recoveryProbability)}</Campo>
          <Campo label="Prioridad">{fmtInt(a.priorityScore)}</Campo>
          <Campo label="Confianza">{fmtInt(a.confidence)}</Campo>
          <Campo label="Gate máximo">{a.maxGate}</Campo>
          <Campo label="Se cayó en">
            {a.dropGate} <span className="block text-[10px] text-muted-foreground">{humanize(a.dropReason)}</span>
          </Campo>
          <Campo label="Impactos">
            {fmtInt(a.followupsTotal)}
            <span className="block text-[10px] text-muted-foreground">{a.followupsAutomated} auto · {a.followupsManual} manuales</span>
          </Campo>
          <Campo label="Último impacto">{a.lastFollowupAt ? tiempoRelativo(a.lastFollowupAt) : '—'}</Campo>
          <Campo label="Primer contacto">{a.firstContactAt ? fmtDate(a.firstContactAt) : '—'}</Campo>
          <Campo label="Próxima acción">{a.nextActionAt ? fmtDate(a.nextActionAt) : '—'}</Campo>
          <Campo label="Cliente">
            {a.isExistingCustomer ? 'sí' : 'no'}
            <span className="block text-[10px] text-muted-foreground">{humanize(a.customerEvidence)}</span>
          </Campo>
          <Campo label="Pago pendiente">{a.paymentPending ? 'sí' : 'no'}</Campo>
          <Campo label="Automatización">{a.automationActive ? 'activa' : 'no'}</Campo>
          <Campo label="Análisis">
            v{a.version}
            <span className="block truncate text-[10px] text-muted-foreground">
              {a.analyzedBy ? humanize(a.analyzedBy) : 'sin analizar'}
              {a.analyzedAt ? ` · ${tiempoRelativo(a.analyzedAt)}` : ''}
            </span>
          </Campo>
        </dl>

        {(a.proposalSummary || a.lastProspectAction || a.lastTeamAction) && (
          <dl className="mt-2 space-y-2 border-t border-border pt-2">
            {a.proposalSummary && <Campo label="Resumen IA">{a.proposalSummary}</Campo>}
            {a.lastProspectAction && (
              <Campo label="Última acción del prospecto">
                “{a.lastProspectAction}”
                {a.lastCustomerMessageAt && <span className="block text-[10px] text-muted-foreground">{tiempoRelativo(a.lastCustomerMessageAt)}</span>}
              </Campo>
            )}
            {a.lastTeamAction && (
              <Campo label="Última acción nuestra">
                {a.lastTeamAction}
                {a.lastTeamMessageAt && <span className="block text-[10px] text-muted-foreground">{tiempoRelativo(a.lastTeamMessageAt)}</span>}
              </Campo>
            )}
            {a.statusReason && <Campo label="Por qué ese estado">{a.statusReason}</Campo>}
          </dl>
        )}
      </Plegable>

      {/* La conversación tal como la leyó el análisis: quién dijo qué y dónde
          hubo silencios. Es lo que explica el gate, y sin esto había que abrir
          el chat entero para entender de dónde salió. */}
      {data.timeline.length > 0 && (
        <Plegable titulo="Línea de tiempo" cuantos={data.timeline.length}>
          <ol className="space-y-1.5">
            {data.timeline.slice(-14).map((item, i) =>
              esHueco(item) ? (
                <li key={`gap-${i}`} className="py-0.5 text-center text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  ── {item.kind === 'silence' ? `silencio · ${diasEntre(item.from, item.to)} días` : `${item.count} mensajes omitidos`} ──
                </li>
              ) : (
                <li key={item.id} className="text-[11px] leading-snug">
                  <span className={cn('font-semibold tracking-wide', TONO_QUIEN[item.who] ?? 'text-muted-foreground')}>{WHO_LABELS[item.who] ?? item.who}</span>
                  <span className="text-muted-foreground"> · {tiempoRelativo(item.at)}</span>
                  {item.flags.length > 0 && <span className="text-muted-foreground"> · {item.flags.map((f) => humanize(f)).join(', ')}</span>}
                  <span className="mt-0.5 block line-clamp-3 text-foreground/85">{item.text}</span>
                </li>
              ),
            )}
          </ol>
        </Plegable>
      )}
    </div>
  );
}

/**
 * Radar del cliente, igual que en el Resumen del Command Center.
 *
 * Se reusa `RadarPanel` del plugin en vez de dibujar otra lista de señales:
 * había dos vistas del mismo dato con distinta forma, y la de acá mostraba
 * menos. Abierto de entrada, porque es parte de lo que se viene a leer.
 */
function RadarDelCliente({ contactId, chatId, nombre, remoteJid }: { contactId: number; chatId: number; nombre: string; remoteJid: string }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', abierto && 'rotate-90')} aria-hidden />
        <RadarIcon className="size-3.5" aria-hidden />
        Radar del cliente
      </button>
      {abierto && (
        <div className="overflow-hidden rounded-xl border border-border">
          <RadarPanel
            contactId={contactId}
            chatId={chatId}
            contactName={nombre}
            remoteJid={remoteJid}
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

/**
 * Un dato del análisis. Mismo patrón que el `Field` de la ficha, un punto más
 * chico: en 300 px de ancho, el tamaño de la ficha entra en una columna sola.
 */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[11px] leading-snug text-foreground">{children}</dd>
    </div>
  );
}

/** Cuántos días hay entre dos fechas ISO, para el cartel de silencio. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(desde);
  const b = Date.parse(hasta);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function esHueco(item: TimelineHit | TimelineGap): item is TimelineGap {
  return 'kind' in item && (item.kind === 'silence' || item.kind === 'omitted');
}

const TONO_QUIEN: Record<string, string> = {
  cliente: 'text-sky-600 dark:text-sky-400',
  humano: 'text-emerald-600 dark:text-emerald-400',
  bot: 'text-muted-foreground',
  ia: 'text-violet-600 dark:text-violet-400',
  nota: 'text-amber-600 dark:text-amber-400',
};

const SIGNAL_STATUS_LABEL: Record<string, string> = {
  new: 'nueva',
  seen: 'vista',
  handled: 'atendida',
  dismissed: 'descartada',
};

/**
 * Una sección plegable, abierta por defecto.
 *
 * Arrancaban cerradas para que la columna no fuera un muro, pero el muro es
 * justamente lo que se quiere acá: entrar y ver al cliente entero sin destapar
 * cajas. El encabezado sigue diciendo cuántos hay, y se pliega la que estorbe.
 */
function Plegable({ titulo, cuantos, children, inicial = true }: { titulo: string; cuantos: number; children: React.ReactNode; inicial?: boolean }) {
  // Abiertos de entrada: la columna es para leer al cliente completo, no para
  // ir destapando cajas. Se pliegan a mano cuando una estorba.
  const [abierto, setAbierto] = useState(inicial);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-90')} aria-hidden />
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{fmtInt(cuantos)}</span>
      </button>
      {abierto && <div className="border-t border-border px-3 py-2">{children}</div>}
    </section>
  );
}

const TONOS = {
  neutro: 'text-muted-foreground',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  ambar: 'text-amber-600 dark:text-amber-400',
} as const;

function Dato({
  icon: Icon,
  label,
  valor,
  hint,
  tono,
}: {
  icon: typeof Coins;
  label: string;
  valor: string;
  hint: string;
  tono: keyof typeof TONOS;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('size-3', TONOS[tono])} aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold" title={valor}>{valor}</p>
      <p className="truncate text-[10px] text-muted-foreground" title={hint}>{hint}</p>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
      <AlertTriangle className="size-3" aria-hidden />
      {texto}
    </span>
  );
}
