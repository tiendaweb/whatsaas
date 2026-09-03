'use client';

import { cn } from '@/lib/utils';
import type { EventoRow } from '../../shared/tipos';
import { diaDelEvento } from '../../shared/tipos';
import { claveDia } from '../data/fechas';
import { MESES } from '../data/tipos-ui';

/**
 * El año en doce mini-meses, con la intensidad de cada día según cuántos
 * eventos tiene. Sirve para ver dónde se acumula el trabajo, no para leer
 * títulos: tocar un día abre ese día.
 */
export function VistaAno({ ano, eventos, onDia }: { ano: number; eventos: EventoRow[]; onDia: (fecha: Date) => void }) {
  const porDia = new Map<string, number>();
  for (const e of eventos) {
    const k = diaDelEvento(e);
    porDia.set(k, (porDia.get(k) ?? 0) + 1);
  }
  const hoy = claveDia(new Date());
  const maximo = Math.max(1, ...porDia.values());

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MESES.map((nombre, mes) => {
        const primero = new Date(ano, mes, 1);
        const ultimo = new Date(ano, mes + 1, 0);
        const previos = (primero.getDay() + 6) % 7;
        return (
          <div key={nombre} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--c-text-secondary)]">{nombre}</p>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: previos }, (_, i) => <span key={`h-${i}`} />)}
              {Array.from({ length: ultimo.getDate() }, (_, i) => {
                const fecha = new Date(ano, mes, i + 1);
                const clave = claveDia(fecha);
                const n = porDia.get(clave) ?? 0;
                const nivel = n === 0 ? 0 : Math.min(4, Math.ceil((n / maximo) * 4));
                return (
                  <button
                    key={clave}
                    type="button"
                    onClick={() => onDia(fecha)}
                    title={`${clave}: ${n} evento${n === 1 ? '' : 's'}`}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded text-[9px] tabular-nums transition-colors',
                      nivel === 0 && 'text-[var(--c-muted)] hover:bg-[var(--c-hover)]',
                      nivel === 1 && 'bg-[color-mix(in_srgb,var(--cal-accent)_18%,transparent)] text-[var(--c-text)]',
                      nivel === 2 && 'bg-[color-mix(in_srgb,var(--cal-accent)_35%,transparent)] text-[var(--c-text)]',
                      nivel === 3 && 'bg-[color-mix(in_srgb,var(--cal-accent)_60%,transparent)] text-white',
                      nivel === 4 && 'bg-[var(--cal-accent)] text-white',
                      clave === hoy && 'ring-1 ring-[var(--c-text)]',
                    )}
                  >
                    {fecha.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
