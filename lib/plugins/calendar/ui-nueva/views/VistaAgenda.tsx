'use client';

import type { EventoRow } from '../../shared/tipos';
import { diaDelEvento } from '../../shared/tipos';
import { TarjetaEvento } from '../components/TarjetaEvento';
import { claveDia, etiquetaLarga } from '../data/fechas';

/** Todo lo que viene, día por día. La vista para leer de corrido. */
export function VistaAgenda({ eventos, onAbrir }: { eventos: EventoRow[]; onAbrir: (e: EventoRow) => void }) {
  const porDia = new Map<string, EventoRow[]>();
  for (const e of eventos) {
    const k = diaDelEvento(e);
    porDia.set(k, [...(porDia.get(k) ?? []), e]);
  }
  const dias = [...porDia.keys()].sort();
  const hoy = claveDia(new Date());

  if (!dias.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--c-border-2)] p-10 text-center">
        <p className="text-sm font-semibold text-[var(--c-text)]">Nada agendado en este rango</p>
        <p className="mt-1 text-xs text-[var(--c-text-secondary)]">Cambiá el período o agendá algo nuevo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {dias.map((clave) => {
        const [y, m, d] = clave.split('-').map(Number);
        const fecha = new Date(y, m - 1, d);
        return (
          <section key={clave} className="space-y-2">
            <h3 className="flex items-baseline gap-2 text-sm font-black tracking-tight text-[var(--c-text)]">
              {clave === hoy ? 'Hoy' : etiquetaLarga(fecha)}
              <span className="text-[11px] font-semibold text-[var(--c-muted)]">{porDia.get(clave)!.length}</span>
            </h3>
            <ul className="space-y-2">
              {porDia.get(clave)!.map((e) => (
                <li key={`${e.id}-${e.ocurrencia ?? ''}`}>
                  <TarjetaEvento evento={e} onAbrir={onAbrir} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
