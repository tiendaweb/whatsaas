'use client';

import { CalendarPlus } from 'lucide-react';
import type { EventoRow } from '../../shared/tipos';
import { diaDelEvento } from '../../shared/tipos';
import { TarjetaEvento } from '../components/TarjetaEvento';
import { claveDia, etiquetaLarga } from '../data/fechas';

/** Un día completo, en una lista. Es la vista de "qué tengo ahora". */
export function VistaDia({ fecha, eventos, onAbrir, onNuevo }: { fecha: Date; eventos: EventoRow[]; onAbrir: (e: EventoRow) => void; onNuevo: (cuando: Date) => void }) {
  const clave = claveDia(fecha);
  const delDia = eventos.filter((e) => diaDelEvento(e) === clave);
  const ahora = new Date();
  const esHoy = claveDia(ahora) === clave;
  const pasados = esHoy ? delDia.filter((e) => new Date(e.endsAt) < ahora) : [];
  const proximos = delDia.filter((e) => !pasados.includes(e));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black tracking-tight text-[var(--c-text)]">
          {etiquetaLarga(fecha)}
          <span className="ml-2 text-sm font-semibold text-[var(--c-muted)]">{delDia.length || 'sin eventos'}</span>
        </h2>
        <button
          type="button"
          onClick={() => onNuevo(new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), Math.max(ahora.getHours() + 1, 9), 0))}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--cal-accent)] px-3 py-2 text-xs font-bold text-white"
        >
          <CalendarPlus className="size-3.5" aria-hidden />
          Agendar
        </button>
      </div>

      {delDia.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--c-border-2)] p-10 text-center">
          <p className="text-sm font-semibold text-[var(--c-text)]">Día libre</p>
          <p className="mt-1 text-xs text-[var(--c-text-secondary)]">Tocá «Agendar» para poner algo.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {proximos.map((e) => (
              <li key={`${e.id}-${e.ocurrencia ?? ''}`}>
                <TarjetaEvento evento={e} onAbrir={onAbrir} />
              </li>
            ))}
          </ul>
          {pasados.length > 0 && (
            <details className="pt-1">
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.18em] text-[var(--c-muted)]">Ya pasó · {pasados.length}</summary>
              <ul className="mt-2 space-y-1 opacity-70">
                {pasados.map((e) => (
                  <li key={`${e.id}-${e.ocurrencia ?? ''}`}>
                    <TarjetaEvento evento={e} onAbrir={onAbrir} compacta />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
