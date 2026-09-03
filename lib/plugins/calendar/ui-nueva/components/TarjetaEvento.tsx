'use client';

import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KIND_META, googleCalendarUrl, type EventoRow } from '../../shared/tipos';
import { KIND_ICON } from '../data/iconos';
import { hora, rangoHoras } from '../data/fechas';

/**
 * Un evento en una lista. Minimalista: la barra de color dice el tipo de un
 * vistazo, y sólo se escribe lo que cambia entre uno y otro.
 */
export function TarjetaEvento({ evento, onAbrir, compacta }: { evento: EventoRow; onAbrir: (e: EventoRow) => void; compacta?: boolean }) {
  const cancelado = evento.status === 'canceled';
  const hecho = evento.status === 'completed';
  const inicio = evento.ocurrencia ?? evento.startsAt;
  return (
    <div className="group/ev relative">
    <button
      type="button"
      onClick={() => onAbrir(evento)}
      title={evento.title}
      className={cn(
        'flex w-full items-start gap-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--c-hover)]',
        compacta && 'gap-1.5 rounded-lg px-2 py-1',
        cancelado && 'opacity-50',
      )}
    >
      <span className="mt-0.5 w-1 shrink-0 self-stretch rounded-full" style={{ background: evento.color || 'var(--cal-accent)' }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn('flex items-center gap-1.5', compacta ? 'text-[11px]' : 'text-sm')}>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--c-text-secondary)]">{evento.allDay ? 'Todo el día' : hora(inicio)}</span>
          <span className={cn('min-w-0 flex-1 truncate font-medium text-[var(--c-text)]', (cancelado || hecho) && 'line-through')}>{evento.title}</span>
        </span>
        {!compacta && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--c-text-secondary)]">
            <span className="inline-flex items-center gap-1">{(() => { const Icon = KIND_ICON[evento.kind] ?? KIND_ICON.other; return <Icon className="size-3" aria-hidden />; })()}{KIND_META[evento.kind]?.label}</span>
            {!evento.allDay && <span className="tabular-nums">{rangoHoras(inicio, evento.endsAt)}</span>}
            {evento.contactName && <span className="truncate">· {evento.contactName}</span>}
            {evento.customerName && !evento.contactName && <span className="truncate">· {evento.customerName}</span>}
            {evento.location && <span className="truncate">· {evento.location}</span>}
          </span>
        )}
      </span>
    </button>
      {/* A mano: guardar en Google es lo que hace que el aviso llegue con la app
          cerrada, así que no puede estar escondido dentro del modal. */}
      {(
        <a
          href={googleCalendarUrl(evento)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Guardar en Google Calendar"
          aria-label={`Guardar «${evento.title}» en Google Calendar`}
          className={cn('absolute rounded-lg text-[var(--c-muted)] opacity-0 transition-opacity hover:bg-[var(--c-hover)] hover:text-[var(--c-text)] focus:opacity-100 group-hover/ev:opacity-100', compacta ? 'right-0.5 top-0.5 p-1' : 'right-1.5 top-1.5 p-1.5')}
        >
          <CalendarPlus className={compacta ? 'size-3' : 'size-3.5'} aria-hidden />
        </a>
      )}
    </div>
  );
}
