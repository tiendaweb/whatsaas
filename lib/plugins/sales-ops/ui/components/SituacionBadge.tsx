'use client';

import { Bot, Building2, Circle, CircleDot, DollarSign, Flame, Hourglass, Moon, Send, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SITUACION_META, type Situacion } from '../../shared/situacion';

/**
 * El icono de la situación, a la izquierda del nombre.
 *
 * Es un icono y no una etiqueta porque va en cada fila: diez palabras
 * repetidas hacia abajo serían más ruido que dato. El `title` dice cuál es y
 * qué significa, y el mismo par icono+color se repite en el filtro, así que la
 * relación entre "lo que tildé" y "lo que veo" se aprende sola.
 */
export const SITUACION_ICONO: Record<Situacion, typeof Circle> = {
  descartado: XCircle,
  pospuesto: Moon,
  contesto: Flame,
  automatizacion: Bot,
  en_cola: Hourglass,
  sin_analizar: Circle,
  cobro: DollarSign,
  escrito: Send,
  cliente: Building2,
  sin_tocar: CircleDot,
};

/**
 * Las clases de cada tono, escritas enteras.
 *
 * Tailwind v4 no ve las clases armadas por interpolación: `text-${tono}-600`
 * no existe en el CSS final y el icono sale sin color. Por eso el mapa es
 * literal y cerrado.
 */
export const SITUACION_COLOR: Record<Situacion, string> = {
  descartado: 'text-muted-foreground/50',
  pospuesto: 'text-violet-600 dark:text-violet-400',
  contesto: 'text-rose-600 dark:text-rose-400',
  automatizacion: 'text-amber-600 dark:text-amber-400',
  en_cola: 'text-blue-600 dark:text-blue-400',
  sin_analizar: 'text-muted-foreground/50',
  cobro: 'text-green-600 dark:text-green-400',
  escrito: 'text-sky-600 dark:text-sky-400',
  cliente: 'text-emerald-600 dark:text-emerald-400',
  sin_tocar: 'text-amber-600 dark:text-amber-400',
};

export function SituacionIcono({ situacion, className }: { situacion: Situacion; className?: string }) {
  const meta = SITUACION_META[situacion];
  const Icon = SITUACION_ICONO[situacion];
  return (
    <span
      title={`${meta.label} · ${meta.hint}`}
      className={cn('flex size-4 shrink-0 items-center justify-center', SITUACION_COLOR[situacion], className)}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/** Con el nombre al lado: para la ficha y la tarjeta del Focus, donde entra. */
export function SituacionBadge({ situacion, className }: { situacion: Situacion; className?: string }) {
  const meta = SITUACION_META[situacion];
  const Icon = SITUACION_ICONO[situacion];
  return (
    <span
      title={meta.hint}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-medium',
        SITUACION_COLOR[situacion],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}
