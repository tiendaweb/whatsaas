'use client';

import useSWR from 'swr';
import { AlertTriangle, Clock, Coins, Flame, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DetailPayload } from '../../shared/api-types';
import { GateBadge } from '../components/GateBadge';
import { ScoreRadar, ejesDeAnalisis } from '../components/ScoreRadar';
import { ErrorState, LoadingRows } from '../components/States';
import { OWNER_LABELS, SIGNAL_LABELS, STATUS_LABELS, SALES_OPS_API, diasTexto, fetcher, fmtInt, humanize, tiempoRelativo } from '../components/format';

/**
 * Columna izquierda del Focus: quién es este cliente, en una pantalla sin
 * scroll si se puede.
 *
 * Todo sale de `GET /contacts/{chatId}`, que ya existía para la ficha: el Focus
 * no agregó ni un endpoint para esto. Lo que cambió es el recorte — de los 40
 * campos del análisis quedan los seis que hacen falta para decidir qué hacer en
 * los próximos treinta segundos.
 */
export function PanelResumen({ chatId, className }: { chatId: number; className?: string }) {
  const { data, error, isLoading, mutate } = useSWR<DetailPayload>(`${SALES_OPS_API}/contacts/${chatId}`, fetcher, {
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
    </div>
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
