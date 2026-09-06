'use client';

import { ArrowRight, Check, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ETAPA_HINTS, ETAPA_LABELS, type Etapa } from './tipos';
import type { ResumenSesion } from './useColaFocus';

/**
 * Lo que reemplaza al cliente cuando se vació la etapa.
 *
 * No es un cartel de "no hay resultados": es el final de algo que se terminó.
 * Por eso dice qué se hizo, no qué falta, y el botón grande es seguir.
 */
export function FinDeEtapa({
  etapa,
  siguiente,
  sesion,
  procesados,
  onSiguiente,
  onSalir,
  onVolverAEmpezar,
}: {
  etapa: Etapa;
  siguiente: Etapa | null;
  sesion: ResumenSesion;
  procesados: number;
  onSiguiente: () => void;
  onSalir: () => void;
  onVolverAEmpezar: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <PartyPopper className="size-6" aria-hidden />
        </div>
        <h2 className="mt-3 text-lg font-semibold">{ETAPA_LABELS[etapa]} está vacía</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {procesados > 0 ? `Procesaste ${procesados} en esta etapa.` : 'No quedaba nadie para trabajar acá.'}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Marcador valor={sesion.ejecutados} label="Ejecutados" tono="text-emerald-600 dark:text-emerald-400" />
          <Marcador valor={sesion.encolados} label="Para conector" tono="text-sky-600 dark:text-sky-400" />
          <Marcador valor={sesion.saltados} label="Saltados" tono="text-muted-foreground" />
        </dl>

        {siguiente ? (
          <>
            <Button className="mt-5 w-full gap-2" onClick={onSiguiente}>
              Seguir con {ETAPA_LABELS[siguiente]}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{ETAPA_HINTS[siguiente]}</p>
          </>
        ) : (
          <>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" aria-hidden />
              Terminaste la ronda completa
            </p>
            <Button variant="outline" className="mt-3 w-full" onClick={onVolverAEmpezar}>
              Volver a empezar
            </Button>
          </>
        )}

        <button type="button" className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={onSalir}>
          Salir de Focus
        </button>
      </div>
    </div>
  );
}

function Marcador({ valor, label, tono }: { valor: number; label: string; tono: string }) {
  return (
    // `<dt>` antes de `<dd>`: es el orden del HTML, y un lector de pantalla
    // anuncia el nombre y después el valor. Visualmente el número va arriba,
    // así que se invierte con flex en vez de invertir el marcado.
    <div className="flex flex-col-reverse rounded-lg border border-border bg-card py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-lg font-semibold tabular-nums ${tono}`}>{valor}</dd>
    </div>
  );
}
