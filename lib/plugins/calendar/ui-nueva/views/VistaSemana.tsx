'use client';

import { cn } from '@/lib/utils';
import type { EventoRow } from '../../shared/tipos';
import { diaDelEvento } from '../../shared/tipos';
import { TarjetaEvento } from '../components/TarjetaEvento';
import { claveDia, etiquetaDia, sumarDias } from '../data/fechas';

/** Los siete días, uno al lado del otro. Tocar un día vacío agenda ahí. */
export function VistaSemana({ lunes, eventos, onAbrir, onNuevo }: { lunes: Date; eventos: EventoRow[]; onAbrir: (e: EventoRow) => void; onNuevo: (cuando: Date) => void }) {
  const hoy = claveDia(new Date());
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {dias.map((fecha) => {
        const clave = claveDia(fecha);
        const delDia = eventos.filter((e) => diaDelEvento(e) === clave);
        return (
          <div key={clave} className={cn('flex min-h-32 flex-col gap-1.5 rounded-2xl border p-2', clave === hoy ? 'border-[var(--cal-accent)] bg-[color-mix(in_srgb,var(--cal-accent)_6%,transparent)]' : 'border-[var(--c-border)] bg-[var(--c-surface)]')}>
            <button
              type="button"
              onDoubleClick={() => onNuevo(new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 9, 0))}
              onClick={() => delDia.length === 0 && onNuevo(new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 9, 0))}
              className="flex items-center justify-between text-left"
              title="Agendar en este día"
            >
              <span className={cn('text-[11px] font-black uppercase tracking-[0.14em]', clave === hoy ? 'text-[var(--cal-accent)]' : 'text-[var(--c-muted)]')}>{etiquetaDia(fecha)}</span>
              {delDia.length > 0 && <span className="text-[10px] font-bold tabular-nums text-[var(--c-muted)]">{delDia.length}</span>}
            </button>
            {delDia.length === 0 ? (
              <span className="text-[10px] text-[var(--c-muted)]">—</span>
            ) : (
              delDia.map((e) => <TarjetaEvento key={`${e.id}-${e.ocurrencia ?? ''}`} evento={e} onAbrir={onAbrir} compacta />)
            )}
          </div>
        );
      })}
    </div>
  );
}
