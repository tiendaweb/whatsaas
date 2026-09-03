'use client';

import { Radar } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Distintivo de "esto lo generó Radar".
 *
 * Va donde antes se leía el prefijo `RADAR ·` del título: el dato sigue igual
 * (ver `lib/plugins/radar/shared/display.ts`), lo único que cambia es que el
 * texto se pinta limpio y la procedencia queda en este chip. Se usa igual en
 * Tareas OS, en el chat y en el propio panel de Radar, así que el acento índigo
 * del plugin viaja con alfa: queda bien sobre las superficies claras y oscuras
 * de las tres pantallas sin depender de sus tokens.
 */
export function RadarTag({
  label,
  size = 'sm',
  className,
  title = 'Generado por Radar',
}: {
  label?: string;
  size?: 'xs' | 'sm';
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md align-middle text-indigo-600 dark:text-indigo-400',
        'bg-indigo-500/10',
        label ? 'px-1.5 py-0.5' : 'p-0.5',
        className,
      )}
    >
      <Radar className={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {label && (
        <span className="text-[10px] font-black uppercase tracking-wide">{label}</span>
      )}
    </span>
  );
}
