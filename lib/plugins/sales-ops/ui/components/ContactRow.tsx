'use client';

import { memo } from 'react';
import { AlarmClock, ArrowRightLeft, Building2, CalendarClock, CheckCheck, ChevronRight, Circle, CircleDot, MessageSquare, MoreHorizontal, Send } from 'lucide-react';
import { KIND_META } from '../radar/kind-meta';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { OWNERS, type Owner } from '../../shared/taxonomy';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { AnalysisRow } from '../../shared/api-types';
import { GateBadge } from './GateBadge';
import { PriorityPill } from './PriorityPill';
import { OWNER_LABELS, STATUS_LABELS, fmtDateTime, iniciales, tiempoRelativo } from './format';

type Props = {
  row: AnalysisRow;
  selected?: boolean;
  active?: boolean;
  selectable?: boolean;
  onOpen: (chatId: number) => void;
  onToggle?: (chatId: number, checked: boolean) => void;
  /** Abre el modal de programados. Sin esto el icono no se dibuja. */
  onProgramados?: (row: AnalysisRow) => void;
  /** Abre la ficha directamente en el chat. Sin esto el icono no se dibuja. */
  onChat?: (chatId: number) => void;
  /** Posponer o transferir el lead desde la fila. Sin esto el menú ⋯ no se dibuja. */
  onLead?: (row: AnalysisRow, action: { kind: 'snooze'; days: number } | { kind: 'transfer'; owner: Owner } | { kind: 'unsnooze' }) => void;
};

const POSPONER = [
  { days: 1, label: 'Mañana' },
  { days: 3, label: '3 días' },
  { days: 7, label: '1 semana' },
  { days: 30, label: '1 mes' },
];

/**
 * Fila de dos líneas, móvil primero:
 *   ◯ Nombre                         G10 · 187 · 🔥
 *     Acción recomendada…            hace 6 h · Carlos   ›
 */
export const ContactRow = memo(function ContactRow({ row, selected, active, selectable, onOpen, onToggle, onProgramados, onChat, onLead }: Props) {
  const tiempo = tiempoRelativo(row.lastCustomerMessageAt);
  const marcas: string[] = [];
  if (row.stale) marcas.push('desactualizado');
  if (row.automationActive) marcas.push('automatización');
  if (row.evidenceGap) marcas.push('hueco');
  if (row.analyzedAt && row.confidence < 55) marcas.push('revisar');
  if (row.status !== 'sin_analizar' && row.status !== 'en_proceso' && row.status !== 'recuperado') marcas.push(STATUS_LABELS[row.status] ?? row.status);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50',
        active && 'bg-muted/70',
        selected && 'bg-primary/5',
      )}
    >
      {selectable && (
        <Checkbox
          checked={Boolean(selected)}
          onCheckedChange={(v) => onToggle?.(row.chatId, v === true)}
          aria-label={`Seleccionar ${row.name}`}
          className="shrink-0"
        />
      )}
      <button
        type="button"
        onClick={() => onOpen(row.chatId)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none"
        aria-label={`Abrir ficha de ${row.name}`}
      >
        <Avatar className="size-9 shrink-0">
          {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
          <AvatarFallback className="text-xs">{iniciales(row.name)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            {/* Sin esto, "recién auditado" y "auditado y ya trabajado" se veían
                igual, y alguien volvía a trabajar al que ya estaba en curso. */}
            <EstadoSeguimiento row={row} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{row.name}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {/* Radar: lo que contestó y todavía nadie atendió. Es lo que decide
                  a quién abrir primero, y hasta ahora sólo se veía en Respuestas. */}
              {row.radar && row.radar.count > 0 && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    row.radar.urgent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                  title={`${row.radar.count} señal${row.radar.count === 1 ? '' : 'es'} del radar sin atender: ${row.radar.kinds.map((k) => KIND_META[k]?.label ?? k).join(', ')}`}
                >
                  {row.radar.kinds.slice(0, 3).map((k) => (
                    <span key={k}>{KIND_META[k]?.emoji ?? '•'}</span>
                  ))}
                  {row.radar.count > 1 && <span className="tabular-nums">{row.radar.count}</span>}
                </span>
              )}
              <GateBadge gate={row.currentGate} />
              <PriorityPill score={row.priorityScore} temperature={row.temperature} />
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {row.recommendedAction || (row.analyzedAt ? 'Sin acción recomendada' : 'Sin analizar')}
            </span>
            <span className="shrink-0 truncate tabular-nums">
              {tiempo}
              {tiempo && ' · '}
              {OWNER_LABELS[row.recommendedOwner] ?? row.recommendedOwner}
            </span>
          </span>
          {marcas.length > 0 && (
            <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground/80">{marcas.join(' · ')}</span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" aria-hidden />
      </button>

      {/* Fuera del botón de la fila a propósito: un botón dentro de otro no es
          HTML válido y el clic se llevaría puesta la apertura de la ficha. */}
      {onChat && (
        <button
          type="button"
          onClick={() => onChat(row.chatId)}
          title={`Abrir el chat de ${row.name}`}
          aria-label={`Abrir el chat de ${row.name}`}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MessageSquare className="size-4" aria-hidden />
        </button>
      )}
      {/* Cliente: el ícono abre su ficha de Clientes (registro, membresías,
          sitios), que es otra cosa que la ficha comercial del chat. */}
      {row.isExistingCustomer || row.customerId ? (
        row.customerId ? (
          <a
            href={`/plugins/customers/${row.customerId}`}
            title="Es cliente · abrir la ficha de cliente"
            aria-label={`Abrir la ficha de cliente de ${row.name}`}
            className="shrink-0 rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
            onClick={(e) => e.stopPropagation()}
          >
            <Building2 className="size-4" aria-hidden />
          </a>
        ) : (
          <span title="Es cliente (sin registro en Clientes todavía)" className="shrink-0 rounded-lg p-1.5 text-emerald-600/70 dark:text-emerald-400/70">
            <Building2 className="size-4" aria-hidden />
          </span>
        )
      ) : null}
      {onProgramados && row.scheduled && row.scheduled.count > 0 ? (
        <button
          type="button"
          onClick={() => onProgramados(row)}
          title={
            row.scheduled.nextRunAt
              ? `${row.scheduled.count} programado${row.scheduled.count === 1 ? '' : 's'} · sale ${fmtDateTime(row.scheduled.nextRunAt)}`
              : `${row.scheduled.count} programado${row.scheduled.count === 1 ? '' : 's'} (pausado)`
          }
          aria-label={`Ver mensajes programados de ${row.name}`}
          className="relative shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CalendarClock className="size-4" aria-hidden />
          {row.scheduled.count > 1 ? (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">
              {row.scheduled.count}
            </span>
          ) : null}
        </button>
      ) : null}
      {onLead && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Más acciones para ${row.name}`} title="Posponer o transferir" className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {row.snoozedUntil ? (
              <DropdownMenuItem onClick={() => onLead(row, { kind: 'unsnooze' })}>
                <AlarmClock className="mr-2 size-4" aria-hidden />
                Quitar la pospuesta (hasta {fmtDateTime(row.snoozedUntil).slice(0, 5)})
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <AlarmClock className="size-3" aria-hidden />
                  Posponer
                </DropdownMenuLabel>
                {POSPONER.map((p) => (
                  <DropdownMenuItem key={p.days} onClick={() => onLead(row, { kind: 'snooze', days: p.days })}>
                    {p.label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <ArrowRightLeft className="size-3" aria-hidden />
              Transferir a
            </DropdownMenuLabel>
            {OWNERS.filter((o) => o !== row.recommendedOwner).map((o) => (
              <DropdownMenuItem key={o} onClick={() => onLead(row, { kind: 'transfer', owner: o })}>
                {OWNER_LABELS[o]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
});

/**
 * Punto de estado a la izquierda del nombre: sin analizar · auditado sin tocar ·
 * con seguimiento.
 *
 * Es un ícono y no una etiqueta porque va a la izquierda de todos los nombres:
 * tres palabras repetidas en cada fila serían más ruido que dato. El title dice
 * qué es y cuándo fue.
 */
function EstadoSeguimiento({ row }: { row: AnalysisRow }) {
  if (!row.analyzedAt) {
    return (
      <span title="Sin analizar" className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/50">
        <Circle className="size-3" aria-hidden />
        <span className="sr-only">Sin analizar</span>
      </span>
    );
  }
  if (!row.followUp && row.lastExecution) {
    // Le salió algo antes del análisis vigente: ya se le escribió, pero la
    // auditoría es posterior. Se distingue del "sin tocar" para que nadie le
    // vuelva a mandar lo mismo creyendo que es la primera vez.
    return (
      <span
        title={`Ya le salió ${row.lastExecution.kind === 'send_message' ? 'un mensaje' : row.lastExecution.kind} · ${tiempoRelativo(row.lastExecution.at)} · análisis posterior`}
        className="flex size-4 shrink-0 items-center justify-center text-sky-600 dark:text-sky-400"
      >
        <Send className="size-3" aria-hidden />
        <span className="sr-only">Ejecutado antes del análisis</span>
      </span>
    );
  }
  if (row.followUp) {
    return (
      <span
        title={`Con seguimiento · ${tiempoRelativo(row.followUp.at)}`}
        className="flex size-4 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400"
      >
        <CheckCheck className="size-3.5" aria-hidden />
        <span className="sr-only">Con seguimiento</span>
      </span>
    );
  }
  return (
    <span title="Auditado, todavía sin tocar" className="flex size-4 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400">
      <CircleDot className="size-3.5" aria-hidden />
      <span className="sr-only">Auditado sin seguimiento</span>
    </span>
  );
}
